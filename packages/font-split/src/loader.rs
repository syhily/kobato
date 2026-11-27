use std::borrow::Cow;
use woff::version2::decompress;

const WOFF2_MAGIC: [u8; 4] = [0x77, 0x4F, 0x46, 0x32];

pub fn is_woff2(data: &[u8]) -> bool {
    data.starts_with(&WOFF2_MAGIC)
}

pub fn smart_load_woff2(data: &[u8]) -> Cow<'_, [u8]> {
    if is_woff2(data) { Cow::Owned(decompress(data).expect("illegal woff2 file")) } else { Cow::Borrowed(data) }
}
