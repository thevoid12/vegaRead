// everything related to epub is done here!

use crate::{errors::{ApplicationError, codes}, models};
use epub::doc::EpubDoc;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use base64::{Engine as _, engine::general_purpose::STANDARD};

pub fn extract_epub_metadata(fp: &str) ->Result<String,ApplicationError>{
let doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
    code: codes::EPUB_ERROR,
    message: Some(format!("reading the epub file failed{}",e)),
})?;

let mut metadata_map: HashMap<String, Vec<String>> = HashMap::new();
for item in &doc.metadata {
    metadata_map.entry(item.property.clone()).or_default().push(item.value.clone());
}

let metadata_json = serde_json::to_string_pretty(&metadata_map).unwrap();
Ok(metadata_json)
}

/// Extracts the cover image of an EPUB as a data URI ("data:image/jpeg;base64,...").
/// Returns None if the EPUB declares no cover image.
pub fn extract_cover_as_data_uri(fp: &str) -> Result<Option<String>, ApplicationError> {
    let mut doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
        code: codes::EPUB_ERROR,
        message: Some(format!("reading the epub file failed: {}", e)),
    })?;

    // Try the epub crate's official cover lookup first.
    let cover_id = doc.get_cover_id()
        // Fallback: find any image resource whose manifest id or path contains "cover"
        .or_else(|| {
            doc.resources.iter()
                .find(|(id, res)| {
                    res.mime.starts_with("image/") && (
                        id.to_lowercase().contains("cover") ||
                        res.path.to_string_lossy().to_lowercase().contains("cover")
                    )
                })
                .map(|(id, _)| id.clone())
        });

    let Some(id) = cover_id else { return Ok(None) };
    let Some((bytes, mime)) = doc.get_resource(&id) else { return Ok(None) };

    let encoded = STANDARD.encode(&bytes);
    Ok(Some(format!("data:{};base64,{}", mime, encoded)))
}

// spine gives us the ordering for the epub files
pub fn get_epub_spine(fp: &str) -> Result<Vec<crate::models::Spine_item_response>, ApplicationError> {
    let doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
        code: codes::EPUB_ERROR,
        message: Some(format!("reading the epub file failed:{}", e)),
    })?;

    // ── Step 1: flatten the EPUB TOC (NCX / NAV) into a path → label map ──────
    // doc.toc is Vec<NavPoint>: each NavPoint has label, content (PathBuf), children.
    // We traverse the tree iteratively so all nesting levels are captured.
    let mut toc_map: HashMap<String, String> = HashMap::new();
    let mut stack = doc.toc.clone();
    while let Some(nav) = stack.pop() {
        // Strip fragment identifier (#anchor) from the content path before lookup
        let raw = nav.content.to_string_lossy().to_string();
        let normalized = raw
            .split('#')
            .next()
            .unwrap_or("")
            .trim_start_matches('/')
            .to_string();
        let label = nav.label.trim().to_string();
        if !normalized.is_empty() && !label.is_empty() {
            toc_map.entry(normalized).or_insert(label);
        }
        stack.extend(nav.children);
    }

    // ── Step 2: build a manifest-id → href string map ────────────────────────
    // doc.resources: HashMap<String, ResourceItem>  ResourceItem has .path and .mime
    let resources: HashMap<String, String> = doc
        .resources
        .iter()
        .map(|(id, resource)| (id.clone(), resource.path.to_string_lossy().into_owned()))
        .collect();

    // ── Step 3: assemble SpineItemResponse with href and TOC title ───────────
    Ok(doc.spine.into_iter().map(|item| {
        let href = resources.get(&item.idref).cloned();

        let title = href.as_deref().and_then(|h| {
            let h = h.trim_start_matches('/');
            // Try exact path match first
            toc_map.get(h).cloned().or_else(|| {
                // Fall back: match by filename only (handles different path prefixes)
                let fname = h.split('/').last().unwrap_or("");
                if fname.is_empty() { return None; }
                toc_map
                    .iter()
                    .find(|(k, _)| k.split('/').last().unwrap_or("") == fname)
                    .map(|(_, v)| v.clone())
            })
        });

        models::Spine_item_response {
            idref: item.idref,
            href,
            title,
            id: item.id,
            properties: item.properties,
            linear: item.linear,
        }
    }).collect())
}


// position = (spine_idx, char_offset) — jump directly to the spine item, never load others
pub fn get_paginated_content(fp: &str, mut spine_idx: usize, mut char_offset: usize, chunk_size: usize) -> Result<models::Content_response, ApplicationError> {
    let mut doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
        code: codes::EPUB_ERROR,
        message: Some(format!("reading the epub file failed: {}", e)),
    })?;

    let id = match doc.spine.get(spine_idx) {
        Some(s) => s.idref.clone(),
        None => return Err(ApplicationError {
            code: codes::EPUB_ERROR,
            message: Some(format!("spine index {} is out of bounds", spine_idx)),
        }),
    };

    // Get the spine item's archive path so we can resolve relative image hrefs.
    let spine_path = doc.resources.get(&id)
        .map(|r| r.path.to_string_lossy().into_owned())
        .unwrap_or_default();

    let content_str = match doc.get_resource_str(&id) {
        Some((c, _)) => c,
        None => return Ok(models::Content_response {
            content: String::new(),
            spine_idx,
            next_char_offset: 0,
            page_size: models::Content_response::PAGE_SIZE,
            current_page: 0,
        }),
    };

    let chars: Vec<char> = content_str.chars().collect();
    let available: usize = chars.len().saturating_sub(char_offset);
    let string_chunk: String;
    if available <= chunk_size {
        // rest of chapter fits in one chunk — return it and advance to next spine item
        string_chunk = content_str
            .chars()
            .skip(char_offset)
            .take(available)
            .collect();
        spine_idx += 1;
        char_offset = 0;
    } else {
        string_chunk = content_str
            .chars()
            .skip(char_offset)
            .take(chunk_size)
            .collect();
        char_offset += chunk_size;
    }

    // Replace relative <img src="..."> paths with inline data URIs so they
    // render correctly inside an iframe srcDoc that has no base URL.
    let content_with_images = inline_images_in_html(&string_chunk, &spine_path, &mut doc);

    // Strip <script> blocks and on* event-handler attributes before sending to
    // the frontend.  The sandboxed iframe (no allow-scripts) would block them
    // and in WebKit that also intercepts click events, preventing SR from working.
    // Stripping happens AFTER pagination so saved char offsets stay valid.
    let content_sanitized = strip_scripts(&strip_event_handlers(&content_with_images));

    Ok(models::Content_response {
        content: content_sanitized,
        spine_idx,
        next_char_offset: char_offset,
        page_size: models::Content_response::PAGE_SIZE,
        current_page: 0, // overridden by the handler when restoring a saved position
    })
}

/// Walks an HTML string and replaces every `<img src="relative-path">` with
/// an inline `data:mime;base64,...` URI so the image renders in a srcDoc iframe.
fn inline_images_in_html(
    html: &str,
    spine_path: &str,
    doc: &mut EpubDoc<impl std::io::Read + std::io::Seek>,
) -> String {
    // Build an owned path → manifest-id map (no live borrow of doc after this).
    let path_to_id: HashMap<PathBuf, String> = doc
        .resources
        .iter()
        .map(|(id, res)| {
            let p = res.path.to_string_lossy();
            let p = p.trim_start_matches('/');
            (PathBuf::from(p), id.clone())
        })
        .collect();

    let spine_dir = Path::new(spine_path)
        .parent()
        .unwrap_or(Path::new(""));

    let mut out = String::with_capacity(html.len());
    let mut rest = html;

    while let Some(img_start) = rest.find("<img") {
        // Verify this is really an <img ...> tag (next char must be whitespace, /, or >)
        let next_ch = rest[img_start + 4..].chars().next();
        if !matches!(next_ch, Some(' ') | Some('\t') | Some('\n') | Some('\r') | Some('/') | Some('>')) {
            out.push_str(&rest[..img_start + 4]);
            rest = &rest[img_start + 4..];
            continue;
        }

        out.push_str(&rest[..img_start]);
        rest = &rest[img_start..];

        let tag_end = rest.find('>').map(|p| p + 1).unwrap_or(rest.len());
        let tag = &rest[..tag_end];
        let rewritten = rewrite_src_attr(tag, spine_dir, &path_to_id, doc);
        out.push_str(&rewritten);
        rest = &rest[tag_end..];
    }

    out.push_str(rest);
    out
}

/// Returns a copy of `tag` with its `src="..."` replaced by a data URI.
/// Returns the tag unchanged if the src cannot be resolved.
fn rewrite_src_attr(
    tag: &str,
    spine_dir: &Path,
    path_to_id: &HashMap<PathBuf, String>,
    doc: &mut EpubDoc<impl std::io::Read + std::io::Seek>,
) -> String {
    let Some(src_pos) = tag.find("src=") else { return tag.to_string() };

    let after_eq = &tag[src_pos + 4..];
    let (quote, val_start): (char, usize) = match after_eq.chars().next() {
        Some('"')  => ('"',  1),
        Some('\'') => ('\'', 1),
        _          => return tag.to_string(),
    };

    let val_str = &after_eq[val_start..];
    let val_end = val_str.find(quote).unwrap_or(val_str.len());
    let src_value = &val_str[..val_end];

    // Leave data URIs and absolute URLs as-is.
    if src_value.starts_with("data:") || src_value.starts_with("http") || src_value.is_empty() {
        return tag.to_string();
    }

    let resolved = resolve_epub_path(spine_dir, Path::new(src_value));
    let Some(id) = path_to_id.get(&resolved) else { return tag.to_string() };
    let Some((bytes, mime)) = doc.get_resource(id) else { return tag.to_string() };

    let encoded = STANDARD.encode(&bytes);
    let data_uri = format!("data:{};base64,{}", mime, encoded);

    // Reconstruct the tag: everything up to and including the opening quote,
    // then the new data URI, then the closing quote onward (the original value
    // is replaced but the surrounding quotes are preserved).
    let before = &tag[..src_pos + 4 + val_start]; // up to and including opening quote
    let after  = &tag[src_pos + 4 + val_start + val_end..]; // from closing quote onward
    format!("{}{}{}", before, data_uri, after)
}

/// Removes `<script>…</script>` blocks from an HTML string.
///
/// Uses `to_ascii_lowercase()` for case-insensitive matching, which produces a
/// string of identical byte length so byte positions are interchangeable between
/// the original and the lowercased copy.  All other bytes are copied unchanged,
/// preserving the original casing and UTF-8 content of the document.
fn strip_scripts(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    loop {
        match lower[pos..].find("<script") {
            None => { out.push_str(&html[pos..]); break; }
            Some(rel) => {
                let start = pos + rel;
                let kw_end = start + 7; // byte after "script"
                // Only strip if the next byte makes this a real tag
                // (whitespace, '>', '/', or end-of-string).
                match html.as_bytes().get(kw_end) {
                    Some(&b) if !matches!(b, b' '|b'\t'|b'\n'|b'\r'|b'>'|b'/') => {
                        out.push_str(&html[pos..kw_end]);
                        pos = kw_end;
                        continue;
                    }
                    _ => {}
                }
                out.push_str(&html[pos..start]);
                match lower[start..].find("</script") {
                    None => break, // malformed — drop to end
                    Some(end_rel) => {
                        let end_abs = start + end_rel;
                        match lower[end_abs..].find('>') {
                            None => break,
                            Some(gt_rel) => pos = end_abs + gt_rel + 1,
                        }
                    }
                }
            }
        }
    }
    out
}

/// Removes `on*="…"` and `on*='…'` event-handler attributes from HTML.
///
/// Works at the byte level.  Whitespace + "on" + alphabetic char + more
/// alphanumeric chars + "=" + quoted value is recognised as an event handler
/// and omitted from the output.  Non-ASCII content is passed through unchanged.
fn strip_event_handlers(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let lb = lower.as_bytes();
    let hb = html.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(html.len());
    let mut i = 0;
    while i < hb.len() {
        // Look for a whitespace byte that could precede an on* attribute.
        if !matches!(hb[i], b' '|b'\t'|b'\n'|b'\r') {
            out.push(hb[i]);
            i += 1;
            continue;
        }
        // After whitespace, check for "on" + alpha.
        let j = i + 1;
        if j + 2 < hb.len()
            && lb[j]   == b'o'
            && lb[j+1] == b'n'
            && lb[j+2].is_ascii_alphabetic()
        {
            // Scan to end of attribute name (alphanumeric).
            let mut k = j;
            while k < hb.len() && lb[k].is_ascii_alphanumeric() { k += 1; }
            // Skip optional whitespace before '='.
            let mut m = k;
            while m < hb.len() && matches!(hb[m], b' '|b'\t') { m += 1; }
            if m < hb.len() && hb[m] == b'=' {
                m += 1; // skip '='
                while m < hb.len() && matches!(hb[m], b' '|b'\t') { m += 1; }
                // Skip the attribute value.
                if m < hb.len() {
                    let q = hb[m];
                    if q == b'"' || q == b'\'' {
                        m += 1; // skip opening quote
                        while m < hb.len() && hb[m] != q { m += 1; }
                        if m < hb.len() { m += 1; } // skip closing quote
                    } else {
                        // Unquoted value: scan to whitespace or '>'.
                        while m < hb.len() && !matches!(hb[m], b' '|b'\t'|b'>'|b'\n'|b'\r') {
                            m += 1;
                        }
                    }
                }
                // Attribute stripped — do NOT push the leading whitespace or the attribute.
                i = m;
                continue;
            }
        }
        // Not an event handler; pass the whitespace through.
        out.push(hb[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Joins `base_dir` with `relative` and collapses any `..` / `.` components,
/// producing the normalised EPUB-archive-relative path of the resource.
fn resolve_epub_path(base_dir: &Path, relative: &Path) -> PathBuf {
    let joined = base_dir.join(relative);
    let mut out = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::ParentDir => { out.pop(); }
            Component::CurDir    => {}
            c                    => out.push(c),
        }
    }
    out
}
