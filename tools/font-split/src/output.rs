#[derive(Debug, Clone)]
pub struct OutputFile {
    pub name: String,
    pub data: Vec<u8>,
}

impl OutputFile {
    pub fn new(name: &str, data: Vec<u8>) -> Self {
        Self { name: name.to_string(), data }
    }
}
