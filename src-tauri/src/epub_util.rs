// everything related to epub is done here!

use crate::{errors::{ApplicationError, codes}, models};
use epub::doc::EpubDoc;
use std::collections::HashMap;

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

    let content_str = match doc.get_resource_str(&id) {
        Some((c, _)) => c,
        None => return Ok(models::Content_response {
            content: String::new(),
            spine_idx,
            next_char_offset: 0,
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

   
    Ok(models::Content_response {
        content: string_chunk,
        spine_idx:spine_idx,
        next_char_offset:char_offset,
    })
}