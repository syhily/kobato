use log::warn;
use opentype::Font;
use opentype::truetype::tables::Names;
use opentype::truetype::tables::names::{NameID, PlatformID};
use std::io::Cursor;

#[derive(Debug, Clone, Default)]
pub struct NameTable {
    pub platform: String,
    pub language: String,
    pub name: String,
    pub value: String,
}

#[derive(Debug, Default)]
pub struct NameTableSets {
    pub table: Vec<NameTable>,
}
impl NameTableSets {
    fn get_language(&self, str: &str) -> Vec<&NameTable> {
        self.table.iter().filter(|x| x.language == str).collect()
    }

    pub fn get_name(&self, str: &str, platform: Option<&str>, language: Option<&str>) -> Vec<&NameTable> {
        let platform = platform.unwrap_or("Windows");
        let table = self.get_language(language.unwrap_or("en"));
        table.iter().filter(|x| x.name == str && x.platform == platform).copied().collect()
    }
    pub fn get_name_first(&self, str: &str) -> Option<String> {
        match self.get_name(str, None, None).first() {
            Some(val) => Option::from(val.value.clone()),
            _ => None,
        }
    }
}

pub fn analyze_name_table(font: &Font, font_file: &mut Cursor<&[u8]>) -> NameTableSets {
    let mut table = NameTableSets { table: vec![] };

    let data: Names = match font.take(font_file) {
        Ok(Some(data)) => data,
        Ok(None) => {
            warn!("名称表为空");
            return table;
        }
        Err(e) => {
            warn!("读取名称表失败: {:?}", e);
            return table;
        }
    };

    data.iter().for_each(|((platform, _, language, name), value)| {
        let key = name_id_to_string(name);
        let void_language_tag_decode: [Option<&str>; 1] = [None];
        if let Some(value) = value {
            table.table.push(NameTable {
                language: language.tag(&void_language_tag_decode).unwrap_or("en").to_string(),
                platform: platform_to_string(platform),
                name: key,
                value,
            });
        };
    });
    table
}

pub fn platform_to_string(platform_id: PlatformID) -> String {
    match platform_id {
        PlatformID::Unicode => "Unicode".to_string(),
        PlatformID::Macintosh => "Macintosh".to_string(),
        PlatformID::Windows => "Windows".to_string(),
    }
}

pub fn name_id_to_string(name_id: NameID) -> String {
    match name_id {
        NameID::CopyrightNotice => "CopyrightNotice".to_string(),
        NameID::FontFamilyName => "FontFamilyName".to_string(),
        NameID::FontSubfamilyName => "FontSubfamilyName".to_string(),
        NameID::UniqueFontID => "UniqueFontID".to_string(),
        NameID::FullFontName => "FullFontName".to_string(),
        NameID::VersionString => "VersionString".to_string(),
        NameID::PostScriptFontName => "PostScriptFontName".to_string(),
        NameID::Trademark => "Trademark".to_string(),
        NameID::ManufacturerName => "ManufacturerName".to_string(),
        NameID::DesignerName => "DesignerName".to_string(),
        NameID::Description => "Description".to_string(),
        NameID::VendorURL => "VendorURL".to_string(),
        NameID::DesignerURL => "DesignerURL".to_string(),
        NameID::LicenseDescription => "LicenseDescription".to_string(),
        NameID::LicenseURL => "LicenseURL".to_string(),
        NameID::TypographicFamilyName => "TypographicFamilyName".to_string(),
        NameID::TypographicSubfamilyName => "TypographicSubfamilyName".to_string(),
        NameID::CompatibleFullFontName => "CompatibleFullFontName".to_string(),
        NameID::SampleText => "SampleText".to_string(),
        NameID::PostScriptCIDFindFontName => "PostScriptCIDFindFontName".to_string(),
        NameID::WWSFamilyName => "WWSFamilyName".to_string(),
        NameID::WWSSubfamilyName => "WWSSubfamilyName".to_string(),
        NameID::LightBackgroundPalette => "LightBackgroundPalette".to_string(),
        NameID::DarkBackgroundPalette => "DarkBackgroundPalette".to_string(),
        NameID::PostScriptVariationNamePrefix => "PostScriptVariationNamePrefix".to_string(),
        _ => "Other".to_string(),
    }
}
