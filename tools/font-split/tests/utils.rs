use kobato_font_split::utils::{read_binary_file, slice_string, u8_size_in_kb, vec_u32_to_string};

#[test]
fn test_u8_size_in_kb() {
    let vec = vec![0; 2048];
    assert_eq!(u8_size_in_kb(&vec), 2.0);
}

#[test]
fn test_vec_u32_to_string() {
    let vec = vec![72, 101, 108, 108, 111];
    assert_eq!(vec_u32_to_string(&vec), "Hello");

    let vec_with_invalid = vec![72, 101, 108, 108, 111, 0x110000];
    assert_eq!(vec_u32_to_string(&vec_with_invalid), "Hello ");
}

#[test]
fn test_read_binary_file() {
    use std::io::Write;
    let file_path = "test.bin";
    let data = vec![1, 2, 3, 4, 5];

    {
        let mut file = std::fs::File::create(file_path).unwrap();
        file.write_all(&data).unwrap();
    }

    let result = read_binary_file(file_path).unwrap();
    assert_eq!(result, data);

    std::fs::remove_file(file_path).unwrap();
}

#[test]
fn test_slice() {
    let text = "Hello, world!";
    assert_eq!("ello, worl", slice_string(text, 1, -2));
}
