pub mod clean;
pub mod count;
pub mod dump;
pub mod emit;
pub mod generate;

use std::path::PathBuf;

pub(crate) const CORPUS_ID: &str = "zhwiki-20261101";
pub(crate) const DUMP_URL: &str =
    "https://dumps.wikimedia.org/zhwiki/20261101/zhwiki-20261101-pages-articles-multistream.xml.bz2";
pub(crate) const DUMP_FILE: &str = "zhwiki-20261101-pages-articles-multistream.xml.bz2";

pub(crate) const FIXTURE_ID_MOD: u64 = 2003;
pub(crate) const FIXTURE_ID_REM: u64 = 7;
pub(crate) const FIXTURE_PAGE_COUNT: usize = 64;
pub(crate) const FIXTURE_MIN_CHARS: usize = 1200;

pub(crate) fn package_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

pub(crate) fn cache_dir() -> PathBuf {
    package_dir().join(".cache")
}

pub(crate) fn dump_path() -> PathBuf {
    cache_dir().join(DUMP_FILE)
}

pub(crate) fn table_dir() -> PathBuf {
    package_dir().join("scripts/cjk-tables")
}

pub fn run() {
    let command = std::env::args().nth(1).unwrap_or_default();
    match command.as_str() {
        "download" => dump::download(),
        "build" => count::build(),
        "generate" => generate::generate(),
        _ => {
            eprintln!("usage: datagen <download|build|generate>");
            eprintln!("  download  fetch the zhwiki dump into .cache/ (resumable)");
            eprintln!("  build     one pass over the dump: char frequencies and held-out page fixtures");
            eprintln!("  generate  regenerate src/unicode/cjk_tables.rs from scripts/cjk-tables/");
            std::process::exit(2);
        }
    }
}
