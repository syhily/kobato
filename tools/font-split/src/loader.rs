use std::borrow::Cow;
use woff::version2::decompress;

const WOFF2_MAGIC: [u8; 4] = [0x77, 0x4F, 0x46, 0x32];

fn is_woff2(data: &[u8]) -> bool {
    data.starts_with(&WOFF2_MAGIC)
}

pub fn smart_load_woff2(data: &[u8]) -> Cow<'_, [u8]> {
    if is_woff2(data) { Cow::Owned(decompress(data).expect("illegal woff2 file")) } else { Cow::Borrowed(data) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_woff2() {
        let valid_woff2 = [0x77, 0x4F, 0x46, 0x32, 0x00, 0x00, 0x00, 0x00];
        assert!(is_woff2(&valid_woff2));

        let invalid_data = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        assert!(!is_woff2(&invalid_data));

        let empty_data = [];
        assert!(!is_woff2(&empty_data));
    }

    #[test]
    fn test_smart_load_woff2() {
        let non_woff2_data = [0x01, 0x02, 0x03, 0x04];
        let result = smart_load_woff2(&non_woff2_data);
        assert!(matches!(result, Cow::Borrowed(_)));
        assert_eq!(result.as_ref(), non_woff2_data);
    }
}
