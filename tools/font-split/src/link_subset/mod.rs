mod css;
pub(crate) mod name_template;
mod output_css;
use crate::{output::OutputFile, runner::Context};

fn output_file(ctx: &mut Context, file_name: &str, content: Vec<u8>) {
    (ctx.callback)(OutputFile::new(file_name, content));
}

pub fn link_subset(ctx: &mut Context) {
    let css = ctx.input.css.clone().unwrap_or_default();

    let css_code = output_css::output_css(ctx, &css);

    let css_file_name = css.file_name.unwrap_or("result.css".to_string());
    output_file(ctx, &css_file_name, css_code.into_bytes());
}
