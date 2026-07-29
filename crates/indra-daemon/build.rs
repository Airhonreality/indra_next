fn main() {
    println!("cargo:rerun-if-changed=proto/sync.proto");
    tonic_build::compile_protos("proto/sync.proto").expect("Failed to compile protos");
}
