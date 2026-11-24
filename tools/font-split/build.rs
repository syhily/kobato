use std::path::Path;

const OUTPUT_DEPS: [&str; 2] = ["harfbuzz_rs_now", "woff"];

fn main() {
    napi_build::setup();
    println!("cargo:rerun-if-changed=Cargo.lock");
    println!("cargo:rustc-env=OUTPUT_DEP_VERSIONS={}", output_dep_versions());
}

fn output_dep_versions() -> String {
    let lock = std::env::var_os("CARGO_MANIFEST_DIR")
        .map(|dir| Path::new(&dir).join("Cargo.lock"))
        .and_then(|path| std::fs::read_to_string(path).ok())
        .unwrap_or_default();
    OUTPUT_DEPS
        .iter()
        .map(|name| {
            let version = lock
                .split("[[package]]")
                .find(|block| block.contains(&format!("name = \"{name}\"\n")))
                .and_then(|block| block.lines().find(|line| line.starts_with("version = ")))
                .map_or("unknown", |line| line["version = \"".len()..].trim_end_matches('"'));
            format!("{name}={version}")
        })
        .collect::<Vec<_>>()
        .join(",")
}
