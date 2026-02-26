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
pub fn get_epub_spine(fp: &str) -> Result<Vec<crate::models::SpineItemResponse>, ApplicationError> {
    let doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
        code: codes::EPUB_ERROR,
        message: Some(format!("reading the epub file failed:{}", e)),
    })?;

    Ok(doc.spine.into_iter().map(|item| models::SpineItemResponse{
        idref: item.idref,
        id: item.id,
        properties: item.properties,
        linear: item.linear,
    }).collect())
}


// position = (spine_idx, char_offset) — jump directly to the spine item, never load others
pub fn get_paginated_content(fp: &str, spine_idx: usize, char_offset: usize, chunk_size: usize) -> Result<String, ApplicationError> {
    let mut doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
        code: codes::EPUB_ERROR,
        message: Some(format!("reading the epub file failed: {}", e)),
    })?;

    // track remaining offset across spine items in case char_offset overshoots current spine
    let mut remaining_offset = char_offset;
    let mut result: Vec<char> = Vec::new();
    let mut current_spine = spine_idx;

    while result.len() < chunk_size {
        let id: String = match doc.spine.get(current_spine) {
            Some(s) => s.idref.clone(),
            None => break,
        };
        if let Some((content, _)) = doc.get_resource_str(&id) {
            let chars: Vec<char> = content.chars().collect();
            if remaining_offset < chars.len() {
                let need = chunk_size - result.len();
                result.extend(chars[remaining_offset..].iter().take(need));
                remaining_offset = 0; // offset only applies to the first spine item
            } else {
                // offset overshoots this spine item, subtract and move to next
                remaining_offset -= chars.len();
            }
        }
        current_spine += 1;
    }

    Ok(result.iter().collect())
}