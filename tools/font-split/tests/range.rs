use kobato_font_split::unicode::range::UnicodeRange;

#[test]
fn parse() {
    let test_cases = ["U+ff65", "U+0-7F", "U+007F-00FF", "U+4??"].join(",");

    let mut data = UnicodeRange::parse(&test_cases);
    let mut target: Vec<u32> = vec![0xff65];

    (0x0..=0x7f).into_iter().for_each(|x| target.push(x));
    (0x7f..=0xff).into_iter().for_each(|x| target.push(x));
    (0x400..=0x4ff).into_iter().for_each(|x| target.push(x));

    target.sort();
    data.sort();

    assert_eq!(data.len(), target.len());
    assert_eq!(data, target)
}

#[test]
fn stringify() {
    let mut target: Vec<u32> = vec![0xff65];

    (0x0..=0x7f).into_iter().for_each(|x| target.push(x));
    (0x7f..=0xff).into_iter().for_each(|x| target.push(x));
    (0x400..=0x4ff).into_iter().for_each(|x| target.push(x));
    let res = UnicodeRange::stringify(&target);
    assert_eq!(res, "U+0-FF,U+400-4FF,U+FF65")
}
