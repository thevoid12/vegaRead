// everything related to epub is done here!

use crate::errors::ApplicationError;
use epub::doc::EpubDoc;
use std::collections::HashMap;

pub fn extract_epub_metadata(fp: &str) ->Result<String,ApplicationError>{
let doc = EpubDoc::new(fp).map_err(|e| ApplicationError {
    code: crate::errors::codes::EPUB_ERROR,
    message: Some(format!("extract metadata from epub failed:{}",e)),
})?;

let mut metadata_map: HashMap<String, Vec<String>> = HashMap::new();
for item in &doc.metadata {
    metadata_map.entry(item.property.clone()).or_default().push(item.value.clone());
}

let metadata_json = serde_json::to_string_pretty(&metadata_map).unwrap();
Ok(metadata_json)
}