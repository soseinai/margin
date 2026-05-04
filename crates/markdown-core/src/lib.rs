use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPartialMarkdownText {
    pub lines: Vec<String>,
    pub frontmatter_blocks: Vec<SourceBlock>,
    pub fenced_blocks: Vec<SourceBlock>,
    pub table_blocks: Vec<SourceBlock>,
    pub math_blocks: Vec<SourceBlock>,
    pub heading_items: Vec<MarkdownHeading>,
    pub ordered_list_markers: Vec<LineMarker>,
    pub list_items: Vec<MarkdownListItem>,
    pub list_owner_by_line: Vec<LineOwner>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceBlock {
    pub start: usize,
    pub end: usize,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frontmatter: Option<MarkdownFrontmatter>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub math: Option<MarkdownMathBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table: Option<MarkdownTable>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownFrontmatter {
    pub entries: Vec<MarkdownFrontmatterEntry>,
    pub raw_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MarkdownFrontmatterEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MarkdownMathBlock {
    pub start: usize,
    pub end: usize,
    pub source: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MarkdownTable {
    pub headers: Vec<String>,
    pub alignments: Vec<Option<String>>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownHeading {
    pub block_end: usize,
    pub level: usize,
    pub line_number: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ListInfo {
    pub indent: usize,
    pub content_indent: usize,
    pub marker: String,
    pub task: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownListLayout {
    pub depth: usize,
    pub marker: String,
    pub marker_offset: usize,
    pub marker_x: usize,
    pub text_x: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownListItem {
    pub block_end: usize,
    pub child_lines: Vec<usize>,
    pub info: ListInfo,
    pub layout: MarkdownListLayout,
    pub line_number: usize,
    pub parent_line: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LineMarker {
    pub line_number: usize,
    pub marker: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LineOwner {
    pub line_number: usize,
    pub item_line_number: usize,
}

pub fn parse_partial_markdown_text(text: &str) -> ParsedPartialMarkdownText {
    let lines = text.split('\n').map(ToOwned::to_owned).collect::<Vec<_>>();
    let frontmatter_blocks = markdown_frontmatter_blocks(&lines);
    let fenced_blocks = fenced_code_blocks(&lines);
    let table_blocks = markdown_table_blocks(&lines);
    let non_math_container_blocks = [
        frontmatter_blocks.as_slice(),
        fenced_blocks.as_slice(),
        table_blocks.as_slice(),
    ]
    .concat();
    let math_blocks =
        markdown_math_blocks(&lines, &ignored_line_numbers(&non_math_container_blocks))
            .into_iter()
            .map(|math| SourceBlock {
                start: math.start,
                end: math.end,
                kind: "math",
                language: None,
                frontmatter: None,
                math: Some(math),
                table: None,
            })
            .collect::<Vec<_>>();
    let ignored_container_blocks =
        [non_math_container_blocks.as_slice(), math_blocks.as_slice()].concat();
    let heading_items = markdown_heading_items(&lines, &ignored_container_blocks);
    let ordered_list_markers =
        ordered_list_markers(&lines, &ignored_line_numbers(&ignored_container_blocks));
    let (list_items, list_owner_by_line) =
        markdown_list_model(&lines, &ordered_list_markers, &ignored_container_blocks);

    let mut ordered_list_marker_entries = ordered_list_markers
        .into_iter()
        .map(|(line_number, marker)| LineMarker {
            line_number,
            marker,
        })
        .collect::<Vec<_>>();

    ordered_list_marker_entries.sort_by_key(|entry| entry.line_number);

    ParsedPartialMarkdownText {
        lines,
        frontmatter_blocks,
        fenced_blocks,
        table_blocks,
        math_blocks,
        heading_items,
        ordered_list_markers: ordered_list_marker_entries,
        list_items,
        list_owner_by_line,
    }
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn margin_markdown_alloc(size: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(size);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn margin_markdown_dealloc(pointer: *mut u8, size: usize) {
    if pointer.is_null() || size == 0 {
        return;
    }

    drop(Vec::from_raw_parts(pointer, 0, size));
}

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn margin_markdown_parse(pointer: *const u8, size: usize) -> *mut u8 {
    let input = std::slice::from_raw_parts(pointer, size);
    let text = std::str::from_utf8(input).unwrap_or("");
    let payload =
        serde_json::to_vec(&parse_partial_markdown_text(text)).unwrap_or_else(|_| b"{}".to_vec());
    let mut output = Vec::with_capacity(payload.len() + 4);

    output.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    output.extend_from_slice(&payload);

    let pointer = output.as_mut_ptr();
    std::mem::forget(output);
    pointer
}

fn markdown_frontmatter_blocks(lines: &[String]) -> Vec<SourceBlock> {
    if lines.len() < 2 || !is_frontmatter_boundary_line(&lines[0]) {
        return Vec::new();
    }

    for line_number in 2..=lines.len() {
        let text = &lines[line_number - 1];

        if !is_frontmatter_boundary_line(text) && !is_frontmatter_closing_line(text) {
            continue;
        }

        return vec![SourceBlock {
            start: 1,
            end: line_number,
            kind: "frontmatter",
            language: None,
            frontmatter: Some(parse_frontmatter(&lines[1..line_number - 1])),
            math: None,
            table: None,
        }];
    }

    Vec::new()
}

fn fenced_code_blocks(lines: &[String]) -> Vec<SourceBlock> {
    let mut blocks = Vec::new();
    let mut open_fence: Option<(usize, MarkdownFenceInfo)> = None;

    for (index, text) in lines.iter().enumerate() {
        let line_number = index + 1;

        if let Some((open_line, fence)) = &open_fence {
            if is_closing_markdown_fence(text, fence) {
                blocks.push(SourceBlock {
                    start: *open_line,
                    end: line_number,
                    kind: "fenced-code",
                    language: Some(fence.language.clone()),
                    frontmatter: None,
                    math: None,
                    table: None,
                });
                open_fence = None;
            }

            continue;
        }

        if let Some(fence) = opening_markdown_fence(text) {
            open_fence = Some((line_number, fence));
        }
    }

    if let Some((open_line, fence)) = open_fence {
        blocks.push(SourceBlock {
            start: open_line,
            end: lines.len(),
            kind: "fenced-code",
            language: Some(fence.language),
            frontmatter: None,
            math: None,
            table: None,
        });
    }

    blocks
}

fn markdown_table_blocks(lines: &[String]) -> Vec<SourceBlock> {
    let mut blocks = Vec::new();
    let mut index = 0;

    while index + 1 < lines.len() {
        let line_number = index + 1;

        if block_for_line(&blocks, line_number).is_some() {
            index += 1;
            continue;
        }

        let Some(header) = markdown_table_cells(&lines[index]) else {
            index += 1;
            continue;
        };
        let Some(delimiter) = markdown_table_cells(&lines[index + 1]) else {
            index += 1;
            continue;
        };

        if !markdown_table_delimiter_cells(&delimiter) {
            index += 1;
            continue;
        }

        let column_count = header.len().max(delimiter.len());
        let mut rows = Vec::new();
        let mut end = line_number + 1;
        let mut row_index = index + 2;

        while row_index < lines.len() {
            let Some(cells) = markdown_table_cells(&lines[row_index]) else {
                break;
            };

            if markdown_table_delimiter_cells(&cells) {
                break;
            }

            rows.push(pad_markdown_table_cells(&cells, column_count));
            end = row_index + 1;
            row_index += 1;
        }

        blocks.push(SourceBlock {
            start: line_number,
            end,
            kind: "table",
            language: None,
            frontmatter: None,
            math: None,
            table: Some(MarkdownTable {
                headers: pad_markdown_table_cells(&header, column_count),
                alignments: pad_markdown_table_alignments(
                    &delimiter
                        .iter()
                        .map(|cell| markdown_table_alignment(cell))
                        .collect::<Vec<_>>(),
                    column_count,
                ),
                rows,
            }),
        });

        index = end;
    }

    blocks
}

fn markdown_math_blocks(
    lines: &[String],
    ignored_lines: &HashSet<usize>,
) -> Vec<MarkdownMathBlock> {
    static SINGLE_LINE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]{0,3}\$\$([\s\S]*?)\$\$[ \t]*$").unwrap());
    static OPENING: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]{0,3}\$\$(.*)$").unwrap());
    static CLOSING: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]{0,3}\$\$[ \t]*$").unwrap());
    let mut blocks = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line_number = index + 1;

        if ignored_lines.contains(&line_number) {
            index += 1;
            continue;
        }

        let line = &lines[index];

        if let Some(captures) = SINGLE_LINE.captures(line) {
            let source = captures
                .get(1)
                .map(|capture| capture.as_str().trim())
                .unwrap_or("");

            if !source.is_empty() {
                blocks.push(MarkdownMathBlock {
                    start: line_number,
                    end: line_number,
                    source: source.to_owned(),
                    raw: line.clone(),
                });
            }

            index += 1;
            continue;
        }

        let Some(opening) = OPENING.captures(line) else {
            index += 1;
            continue;
        };
        let mut source_lines = vec![opening
            .get(1)
            .map(|capture| capture.as_str())
            .unwrap_or("")
            .to_owned()];
        let mut end_index = None;
        let mut closing_index = index + 1;

        while closing_index < lines.len() {
            let closing_line_number = closing_index + 1;

            if ignored_lines.contains(&closing_line_number) {
                break;
            }

            if CLOSING.is_match(&lines[closing_index]) {
                end_index = Some(closing_index);
                break;
            }

            source_lines.push(lines[closing_index].clone());
            closing_index += 1;
        }

        let Some(end_index) = end_index else {
            index += 1;
            continue;
        };
        let source = source_lines.join("\n").trim().to_owned();

        if !source.is_empty() {
            blocks.push(MarkdownMathBlock {
                start: line_number,
                end: end_index + 1,
                source,
                raw: lines[index..=end_index].join("\n"),
            });
        }

        index = end_index + 1;
    }

    blocks
}

fn markdown_heading_items(
    lines: &[String],
    ignored_blocks: &[SourceBlock],
) -> Vec<MarkdownHeading> {
    let ignored_lines = ignored_line_numbers(ignored_blocks);
    let mut headings = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let line_number = index + 1;

        if ignored_lines.contains(&line_number) {
            continue;
        }

        let Some((level, text)) = markdown_heading_line(line) else {
            continue;
        };

        headings.push(MarkdownHeading {
            block_end: lines.len(),
            level,
            line_number,
            text,
        });
    }

    for index in 0..headings.len() {
        for next_index in index + 1..headings.len() {
            if headings[next_index].level <= headings[index].level {
                headings[index].block_end = headings[next_index].line_number - 1;
                break;
            }
        }
    }

    headings
}

fn ordered_list_markers(
    lines: &[String],
    ignored_lines: &HashSet<usize>,
) -> HashMap<usize, String> {
    static ORDERED: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^(\s*)(\d+)[.)]\s+(?:\[[ xX]\]\s+)?").unwrap());
    static UNORDERED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\s*)[-*+]\s+").unwrap());
    let mut markers = HashMap::new();
    let mut stack: Vec<OrderedListContext> = Vec::new();

    for (index, text) in lines.iter().enumerate() {
        let line_number = index + 1;

        if ignored_lines.contains(&line_number) {
            continue;
        }

        if let Some(captures) = ORDERED.captures(text) {
            let indent = markdown_indent_width(
                captures
                    .get(1)
                    .map(|capture| capture.as_str())
                    .unwrap_or(""),
            );
            let value = captures
                .get(2)
                .and_then(|capture| capture.as_str().parse::<usize>().ok())
                .unwrap_or(1);

            while stack.last().is_some_and(|context| context.indent > indent) {
                stack.pop();
            }

            if let Some(current) = stack.last_mut().filter(|context| context.indent == indent) {
                current.value += 1;
            } else {
                stack.push(OrderedListContext { indent, value });
            }

            if let Some(current) = stack.last() {
                markers.insert(line_number, format!("{}.", current.value));
            }

            continue;
        }

        if let Some(captures) = UNORDERED.captures(text) {
            let indent = markdown_indent_width(
                captures
                    .get(1)
                    .map(|capture| capture.as_str())
                    .unwrap_or(""),
            );

            while stack.last().is_some_and(|context| context.indent >= indent) {
                stack.pop();
            }

            continue;
        }

        if !text.trim().is_empty() {
            let indent = leading_markdown_indent(text);

            while stack.last().is_some_and(|context| context.indent >= indent) {
                stack.pop();
            }
        }
    }

    markers
}

fn markdown_list_model(
    lines: &[String],
    ordered_list_markers: &HashMap<usize, String>,
    ignored_blocks: &[SourceBlock],
) -> (Vec<MarkdownListItem>, Vec<LineOwner>) {
    let ignored_lines = ignored_line_numbers(ignored_blocks);
    let mut items = Vec::<MarkdownListItem>::new();
    let mut item_indices_by_line = HashMap::<usize, usize>::new();
    let mut stack = Vec::<usize>::new();

    for (index, text) in lines.iter().enumerate() {
        let line_number = index + 1;
        let info = if ignored_lines.contains(&line_number) {
            None
        } else {
            markdown_list_info(text)
        };

        let Some(info) = info else {
            if !text.trim().is_empty() {
                let source_indent = leading_markdown_indent(text);

                while stack.last().is_some_and(|item_index| {
                    source_indent < items[*item_index].info.content_indent
                }) {
                    stack.pop();
                }
            }

            continue;
        };

        while stack.last().is_some_and(|item_index| {
            let item = &items[*item_index];

            item.info.indent >= info.indent
                || !belongs_to_list_continuation(
                    lines,
                    item.line_number + 1,
                    line_number,
                    &item.info,
                )
        }) {
            stack.pop();
        }

        let parent_index = stack.last().copied();
        let parent_line = parent_index.map(|item_index| items[item_index].line_number);
        let parent_layout = parent_index.map(|item_index| items[item_index].layout.clone());
        let display_marker = ordered_list_markers
            .get(&line_number)
            .cloned()
            .unwrap_or_else(|| info.marker.clone());
        let item = MarkdownListItem {
            block_end: line_number,
            child_lines: Vec::new(),
            layout: markdown_list_layout_for_item(&info, parent_layout.as_ref(), &display_marker),
            info,
            line_number,
            parent_line,
        };
        let item_index = items.len();

        if let Some(parent_index) = parent_index {
            items[parent_index].child_lines.push(line_number);
        }

        item_indices_by_line.insert(line_number, item_index);
        items.push(item);
        stack.push(item_index);
    }

    for item in &mut items {
        item.block_end = markdown_list_block_end_for_item(lines, item);
    }

    let mut owner_by_line = HashMap::<usize, usize>::new();

    for item in &items {
        for line_number in item.line_number..=item.block_end {
            match owner_by_line.get(&line_number) {
                Some(owner_line) => {
                    let owner_index = item_indices_by_line[owner_line];

                    if item.info.indent >= items[owner_index].info.indent {
                        owner_by_line.insert(line_number, item.line_number);
                    }
                }
                None => {
                    owner_by_line.insert(line_number, item.line_number);
                }
            }
        }
    }

    let mut owner_entries = owner_by_line
        .into_iter()
        .map(|(line_number, item_line_number)| LineOwner {
            line_number,
            item_line_number,
        })
        .collect::<Vec<_>>();

    owner_entries.sort_by_key(|entry| entry.line_number);
    items.sort_by_key(|item| item.line_number);

    (items, owner_entries)
}

fn ignored_line_numbers(blocks: &[SourceBlock]) -> HashSet<usize> {
    let mut lines = HashSet::new();

    for block in blocks {
        for line_number in block.start..=block.end {
            lines.insert(line_number);
        }
    }

    lines
}

fn block_for_line(blocks: &[SourceBlock], line_number: usize) -> Option<&SourceBlock> {
    blocks
        .iter()
        .find(|block| line_number >= block.start && line_number <= block.end)
}

fn is_frontmatter_boundary_line(text: &str) -> bool {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[ \t]*---[ \t]*$").unwrap());

    PATTERN.is_match(text)
}

fn is_frontmatter_closing_line(text: &str) -> bool {
    static PATTERN: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]*\.\.\.[ \t]*$").unwrap());

    PATTERN.is_match(text)
}

fn parse_frontmatter(raw_lines: &[String]) -> MarkdownFrontmatter {
    static ENTRY: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]*([A-Za-z0-9_.-]+):[ \t]*(.*)$").unwrap());
    static LIST_ITEM: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^[ \t]+-[ \t]+(.+)$").unwrap());
    static CONTINUATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[ \t]+(.+)$").unwrap());
    let mut entries = Vec::<MarkdownFrontmatterEntry>::new();
    let mut current_index = None;

    for line in raw_lines {
        if let Some(captures) = ENTRY.captures(line) {
            entries.push(MarkdownFrontmatterEntry {
                key: captures
                    .get(1)
                    .map(|capture| capture.as_str())
                    .unwrap_or("")
                    .to_owned(),
                value: frontmatter_value_label(
                    captures
                        .get(2)
                        .map(|capture| capture.as_str())
                        .unwrap_or(""),
                ),
            });
            current_index = Some(entries.len() - 1);
            continue;
        }

        let Some(index) = current_index else {
            continue;
        };

        if let Some(captures) = LIST_ITEM.captures(line) {
            let next = frontmatter_value_label(
                captures
                    .get(1)
                    .map(|capture| capture.as_str())
                    .unwrap_or(""),
            );
            entries[index].value = join_frontmatter_value(&entries[index].value, &next, ", ");
            continue;
        }

        if let Some(captures) = CONTINUATION.captures(line) {
            let next = frontmatter_value_label(
                captures
                    .get(1)
                    .map(|capture| capture.as_str())
                    .unwrap_or(""),
            );
            entries[index].value = join_frontmatter_value(&entries[index].value, &next, " ");
        }
    }

    MarkdownFrontmatter {
        entries,
        raw_lines: raw_lines.to_vec(),
    }
}

fn frontmatter_value_label(value: &str) -> String {
    let trimmed = value.trim();

    if trimmed.len() >= 2
        && ((trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\'')))
    {
        return trimmed[1..trimmed.len() - 1].to_owned();
    }

    trimmed.to_owned()
}

fn join_frontmatter_value(current: &str, next: &str, separator: &str) -> String {
    if current.is_empty() {
        return next.to_owned();
    }

    if next.is_empty() {
        return current.to_owned();
    }

    format!("{current}{separator}{next}")
}

#[derive(Debug, Clone)]
struct MarkdownFenceInfo {
    marker: char,
    length: usize,
    language: String,
}

fn opening_markdown_fence(text: &str) -> Option<MarkdownFenceInfo> {
    static PATTERN: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^\s*(`{3,}|~{3,})(.*)$").unwrap());
    let captures = PATTERN.captures(text)?;
    let marker_text = captures.get(1)?.as_str();
    let marker = marker_text.chars().next()?;
    let info = captures
        .get(2)
        .map(|capture| capture.as_str())
        .unwrap_or("");

    Some(MarkdownFenceInfo {
        marker,
        length: marker_text.chars().count(),
        language: markdown_code_fence_language(info),
    })
}

fn markdown_code_fence_language(info: &str) -> String {
    info.split_whitespace()
        .next()
        .unwrap_or("")
        .trim_start_matches("{.")
        .trim_start_matches('.')
        .trim_start_matches("language-")
        .trim_end_matches('}')
        .to_owned()
}

fn is_closing_markdown_fence(text: &str, fence: &MarkdownFenceInfo) -> bool {
    let trimmed = text.trim();

    !trimmed.is_empty()
        && trimmed.starts_with(fence.marker)
        && trimmed.chars().count() >= fence.length
        && trimmed.chars().all(|character| character == fence.marker)
}

fn markdown_table_cells(text: &str) -> Option<Vec<String>> {
    let trimmed = text.trim();

    if !trimmed.contains('|') {
        return None;
    }

    let mut row = trimmed;

    if let Some(stripped) = row.strip_prefix('|') {
        row = stripped;
    }

    if let Some(stripped) = row.strip_suffix('|') {
        row = stripped;
    }

    let mut cells = Vec::new();
    let mut current = String::new();
    let mut escaped = false;

    for character in row.chars() {
        if escaped {
            if character == '|' {
                current.push('|');
            } else {
                current.push('\\');
                current.push(character);
            }

            escaped = false;
            continue;
        }

        if character == '\\' {
            escaped = true;
            continue;
        }

        if character == '|' {
            cells.push(current.trim().to_owned());
            current.clear();
            continue;
        }

        current.push(character);
    }

    cells.push(current.trim().to_owned());

    (cells.len() > 1).then_some(cells)
}

fn markdown_table_delimiter_cells(cells: &[String]) -> bool {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^:?-{3,}:?$").unwrap());

    !cells.is_empty()
        && cells
            .iter()
            .all(|cell| PATTERN.is_match(&cell.split_whitespace().collect::<String>()))
}

fn markdown_table_alignment(cell: &str) -> Option<String> {
    let normalized = cell.split_whitespace().collect::<String>();
    let left = normalized.starts_with(':');
    let right = normalized.ends_with(':');

    match (left, right) {
        (true, true) => Some("center".to_owned()),
        (false, true) => Some("right".to_owned()),
        (true, false) => Some("left".to_owned()),
        (false, false) => None,
    }
}

fn pad_markdown_table_cells(cells: &[String], length: usize) -> Vec<String> {
    (0..length)
        .map(|index| cells.get(index).cloned().unwrap_or_default())
        .collect()
}

fn pad_markdown_table_alignments(
    alignments: &[Option<String>],
    length: usize,
) -> Vec<Option<String>> {
    (0..length)
        .map(|index| alignments.get(index).cloned().unwrap_or(None))
        .collect()
}

fn markdown_heading_line(text: &str) -> Option<(usize, String)> {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(#{1,6})(\s+)(.*)").unwrap());
    let captures = PATTERN.captures(text)?;
    let level = captures.get(1)?.as_str().chars().count();
    let text = captures
        .get(3)
        .map(|capture| capture.as_str())
        .unwrap_or("")
        .trim();

    Some((level, text.to_owned()))
}

fn markdown_list_info(text: &str) -> Option<ListInfo> {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^(\s*)((?:[-*+])|(?:\d+[.)]))(\s+)(?:\[([ xX])\]\s+)?").unwrap()
    });
    let captures = PATTERN.captures(text)?;
    let indent_text = captures
        .get(1)
        .map(|capture| capture.as_str())
        .unwrap_or("");
    let marker = captures
        .get(2)
        .map(|capture| capture.as_str())
        .unwrap_or("");
    let spacing = captures
        .get(3)
        .map(|capture| capture.as_str())
        .unwrap_or("");
    let indent = markdown_indent_width(indent_text);

    Some(ListInfo {
        indent,
        content_indent: indent + markdown_indent_width(&format!("{marker}{spacing}")),
        marker: marker.to_owned(),
        task: captures.get(4).is_some(),
    })
}

fn belongs_to_list_continuation(
    lines: &[String],
    start_line: usize,
    end_line: usize,
    info: &ListInfo,
) -> bool {
    for line_number in start_line..=end_line {
        let text = lines.get(line_number - 1).map(String::as_str).unwrap_or("");

        if !text.trim().is_empty() && leading_markdown_indent(text) < info.content_indent {
            return false;
        }
    }

    true
}

fn markdown_list_block_end_for_item(lines: &[String], item: &MarkdownListItem) -> usize {
    let mut end = item.line_number;

    for next_line in item.line_number + 1..=lines.len() {
        let text = lines.get(next_line - 1).map(String::as_str).unwrap_or("");

        if text.trim().is_empty() || leading_markdown_indent(text) >= item.info.content_indent {
            end = next_line;
            continue;
        }

        break;
    }

    end
}

fn markdown_list_layout_for_item(
    info: &ListInfo,
    parent_layout: Option<&MarkdownListLayout>,
    display_marker: &str,
) -> MarkdownListLayout {
    let marker = if is_ordered_list_marker(&info.marker) {
        display_marker
    } else {
        &info.marker
    };
    let marker_x = parent_layout.map(|layout| layout.text_x).unwrap_or(0);
    let marker_offset = markdown_list_marker_offset(info, marker);

    MarkdownListLayout {
        depth: parent_layout.map(|layout| layout.depth + 1).unwrap_or(0),
        marker: marker.to_owned(),
        marker_offset,
        marker_x,
        text_x: marker_x + marker_offset,
    }
}

fn markdown_list_marker_offset(info: &ListInfo, display_marker: &str) -> usize {
    if info.task {
        return 30;
    }

    if is_ordered_list_marker(display_marker) {
        return 22.max(display_marker.chars().count() * 9 + 5);
    }

    12
}

fn is_ordered_list_marker(marker: &str) -> bool {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+[.)]$").unwrap());

    PATTERN.is_match(marker)
}

#[derive(Debug)]
struct OrderedListContext {
    indent: usize,
    value: usize,
}

fn leading_markdown_indent(text: &str) -> usize {
    let whitespace = text
        .chars()
        .take_while(|character| character.is_whitespace())
        .collect::<String>();

    markdown_indent_width(&whitespace)
}

fn markdown_indent_width(value: &str) -> usize {
    value
        .chars()
        .map(|character| if character == '\t' { 4 } else { 1 })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nested_list_ownership_and_layout() {
        let model = parse_partial_markdown_text("- Parent\n  - Child\n    - Grandchild");

        assert_eq!(model.list_items.len(), 3);
        assert_eq!(model.list_items[0].child_lines, vec![2]);
        assert_eq!(model.list_items[1].parent_line, Some(1));
        assert_eq!(model.list_items[1].layout.marker_x, 12);
        assert_eq!(model.list_items[1].layout.text_x, 24);
        assert_eq!(
            model.list_owner_by_line,
            vec![
                LineOwner {
                    line_number: 1,
                    item_line_number: 1,
                },
                LineOwner {
                    line_number: 2,
                    item_line_number: 2,
                },
                LineOwner {
                    line_number: 3,
                    item_line_number: 3,
                },
            ]
        );
    }

    #[test]
    fn ignores_container_blocks_when_parsing_lists_and_math() {
        let model = parse_partial_markdown_text("```\n- not list\n```\n\n$$\nx + y\n$$\n\n- list");

        assert_eq!(model.fenced_blocks[0].start, 1);
        assert_eq!(model.math_blocks[0].start, 5);
        assert_eq!(model.list_items.len(), 1);
        assert_eq!(model.list_items[0].line_number, 9);
    }

    #[test]
    fn parses_table_frontmatter_and_ordered_markers() {
        let model = parse_partial_markdown_text(
            "---\ntags:\n  - a\n  - b\n---\n\n3. Start\n4. Next\n\n| A | B |\n| --- | :---: |\n| c | d |",
        );

        assert_eq!(model.frontmatter_blocks[0].end, 5);
        assert_eq!(
            model.frontmatter_blocks[0]
                .frontmatter
                .as_ref()
                .unwrap()
                .entries[0]
                .value,
            "a, b"
        );
        assert_eq!(
            model.ordered_list_markers,
            vec![
                LineMarker {
                    line_number: 7,
                    marker: "3.".to_owned(),
                },
                LineMarker {
                    line_number: 8,
                    marker: "4.".to_owned(),
                },
            ]
        );
        assert_eq!(
            model.table_blocks[0].table.as_ref().unwrap().alignments,
            vec![None, Some("center".to_owned())]
        );
    }
}
