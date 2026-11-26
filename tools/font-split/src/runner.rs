use crate::config::FontSplitConfig;
use crate::link_subset::link_subset;
use crate::loader::smart_load_woff2;
use crate::output::OutputFile;
use crate::pre_subset::fvar::FvarTable;
use crate::pre_subset::name_table::NameTableSets;
use crate::pre_subset::pre_subset;
use crate::run_subset::{RunSubsetResult, run_subset};
use harfbuzz_rs_now::{Face, Owned};
use log::info;

pub struct Context<'a, 'b, 'c>
where
    'b: 'a,
    'c: 'a,
{
    pub input: &'c FontSplitConfig,
    pub binary: &'c [u8],
    pub pre_subset_result: Vec<Vec<u32>>,
    pub pre_subset_languages: Vec<Option<String>>,
    pub run_subset_result: Vec<RunSubsetResult>,
    pub name_table: NameTableSets,
    pub face: &'a mut Owned<Face<'b>>,
    pub callback: &'a dyn Fn(OutputFile),
    pub fvar_table: Option<FvarTable>,
}

pub fn create_context<'a, 'b, 'c, F: Fn(OutputFile)>(
    config: &'c FontSplitConfig,
    binary: &'c [u8],
    face: &'a mut Owned<Face<'b>>,
    callback: &'a F,
) -> Context<'a, 'b, 'c> {
    info!("version {}", env!("CARGO_PKG_VERSION"));
    Context {
        input: config,
        binary,
        pre_subset_result: vec![],
        pre_subset_languages: vec![],
        run_subset_result: vec![],
        name_table: NameTableSets { table: vec![] },
        callback,
        face,
        fvar_table: None,
    }
}

pub fn font_split<F: Fn(OutputFile)>(config: FontSplitConfig, callback: F) {
    let binary = smart_load_woff2(&config.input);
    let mut face = Face::from_bytes(&binary, 0);
    let mut ctx = create_context(&config, &binary, &mut face, &callback);

    for process in [pre_subset, run_subset, link_subset] {
        process(&mut ctx)
    }
}
