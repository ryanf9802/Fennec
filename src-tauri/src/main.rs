fn main() {
    let mut args = std::env::args_os();
    let _executable = args.next();
    if args.next().as_deref() == Some(std::ffi::OsStr::new("--configure-file")) {
        let result = args
            .next()
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "missing configuration path",
                )
            })
            .and_then(|path| fennec_companion_lib::configure_path(std::path::Path::new(&path)));
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    }
    fennec_companion_lib::run();
}
