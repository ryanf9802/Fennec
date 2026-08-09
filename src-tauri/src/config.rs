use std::{fs, io, path::Path};

const SECTION: &str = "[TAGame.MatchStatsExporter_TA]";
const REQUIRED: [(&str, &str); 3] = [
    ("PacketSendRate", "2"),
    ("Port", "49123"),
    ("WebPort", "49124"),
];

pub fn configured(text: &str) -> bool {
    let mut active = false;
    let mut found = std::collections::HashMap::new();
    for raw in text.lines() {
        let line = raw.trim().trim_start_matches('\u{feff}');
        if line.starts_with('[') {
            active = line == SECTION;
        } else if active && !line.starts_with(';') {
            if let Some((key, value)) = line.split_once('=') {
                found.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
            }
        }
    }
    REQUIRED
        .iter()
        .all(|(key, value)| found.get(&key.to_ascii_lowercase()) == Some(&value.to_string()))
}

pub fn patch(text: &str) -> String {
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut lines: Vec<String> = text.lines().map(ToString::to_string).collect();
    let start = match lines
        .iter()
        .position(|line| line.trim().trim_start_matches('\u{feff}') == SECTION)
    {
        Some(index) => index,
        None => {
            if lines.last().is_some_and(|line| !line.trim().is_empty()) {
                lines.push(String::new());
            }
            lines.push(SECTION.to_string());
            lines.len() - 1
        }
    };
    let mut end = lines
        .iter()
        .enumerate()
        .skip(start + 1)
        .find(|(_, line)| line.trim().starts_with('['))
        .map(|(index, _)| index)
        .unwrap_or(lines.len());
    for (key, value) in REQUIRED {
        let prefix = format!("{}=", key.to_ascii_lowercase());
        if let Some(index) = (start + 1..end).find(|index| {
            lines[*index]
                .trim()
                .to_ascii_lowercase()
                .starts_with(&prefix)
        }) {
            lines[index] = format!("{key}={value}");
        } else {
            lines.insert(end, format!("{key}={value}"));
            end += 1;
        }
    }
    lines.join(newline)
}

pub fn configure_file(path: &Path) -> io::Result<()> {
    let original = fs::read_to_string(path)?;
    if configured(&original) {
        return Ok(());
    }
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let backup = path.with_extension(format!("ini.fennec-{timestamp}.bak"));
    fs::copy(path, &backup)?;
    let next = patch(&original);
    if let Err(error) = fs::write(path, &next) {
        let _ = fs::copy(&backup, path);
        return Err(error);
    }
    if !configured(&fs::read_to_string(path)?) {
        let _ = fs::copy(&backup, path);
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "configuration verification failed",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patches_only_required_values() {
        let input = "[Other]\nKeep=1\n[TAGame.MatchStatsExporter_TA]\n; note\nPacketSendRate=0\n";
        let output = patch(input);
        assert!(configured(&output));
        assert!(output.contains("Keep=1"));
        assert!(output.contains("; note"));
    }

    #[test]
    fn preserves_bom_without_duplicate_section() {
        let output = patch("\u{feff}[TAGame.MatchStatsExporter_TA]\nPacketSendRate=0");
        assert!(configured(&output));
        assert_eq!(output.matches(SECTION).count(), 1);
    }
}
