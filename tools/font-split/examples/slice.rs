use kobato_font_split::{FontSplitConfig, font_split};

fn main() {
    let path = std::env::args().nth(1).expect("usage: slice <font-path>");
    let input = std::fs::read(&path).expect("read font file");
    let start = std::time::Instant::now();
    let outputs = std::cell::RefCell::new(Vec::new());
    font_split(FontSplitConfig { input, ..Default::default() }, |file| {
        outputs.borrow_mut().push(file);
    });
    let outputs = outputs.into_inner();
    println!("elapsed {:?}", start.elapsed());
    for file in &outputs {
        println!("{} ({}B)", file.name, file.data.len());
    }
    if let Some(dir) = std::env::args().nth(2) {
        for file in &outputs {
            let target = format!("{dir}/{}", file.name);
            std::fs::write(&target, &file.data).expect("write output");
        }
    }
}
