fn main() {
    tonic_build::compile_protos("proto/sync.proto")
        .expect("Failed to compile proto");
}
