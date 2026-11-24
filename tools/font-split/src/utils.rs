pub fn u8_size_in_kb(vec: &[u8]) -> f64 {
    let size_in_bytes = vec.len();

    size_in_bytes as f64 / 1024.0
}

pub fn vec_u32_to_string(vec: &[u32]) -> String {
    let chars: Vec<char> = vec.iter().map(|u| std::char::from_u32(*u).unwrap_or(' ')).collect();
    chars.into_iter().collect()
}

pub fn read_binary_file(file_path: &str) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut file = std::fs::File::open(file_path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    Ok(buffer)
}

pub fn output_file(file_path: &str, buffer: &[u8]) -> std::io::Result<()> {
    use std::fs::File;
    use std::io::Write;
    use std::path::Path;
    let path = Path::new(file_path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = File::create(path)?;
    file.write_all(buffer)?;
    Ok(())
}

pub fn slice_string(s: &str, start: isize, end: isize) -> String {
    let len = s.chars().count() as isize;
    let start = if start < 0 { len + start } else { start } as usize;
    let end = if end < 0 { len + end } else { end } as usize;

    let start = start.min(len as usize);
    let end = end.min(len as usize).max(start);

    s.chars().skip(start).take(end - start).collect()
}
