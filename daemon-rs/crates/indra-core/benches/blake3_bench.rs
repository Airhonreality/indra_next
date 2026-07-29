use criterion::{black_box, criterion_group, criterion_main, Criterion};
use indra_core::{Blake3Hasher, Blake3Hash};

fn bench_blake3_100mb(c: &mut Criterion) {
    c.bench_function("blake3_100mb", |b| {
        b.iter(|| {
            let data = black_box(vec![0x42u8; 100 * 1024 * 1024]);
            Blake3Hasher::hash(&data)
        });
    });
}

fn bench_blake3_1mb(c: &mut Criterion) {
    c.bench_function("blake3_1mb", |b| {
        b.iter(|| {
            let data = black_box(vec![0x42u8; 1024 * 1024]);
            Blake3Hasher::hash(&data)
        });
    });
}

fn bench_blake3_tree_hash_1k(c: &mut Criterion) {
    c.bench_function("blake3_tree_hash_1k", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let hashes = black_box(vec![Blake3Hash::default(); 1000]);
            Blake3Hasher::tree_hash(&hashes).await.unwrap()
        });
    });
}

fn bench_blake3_tree_hash_10k(c: &mut Criterion) {
    c.bench_function("blake3_tree_hash_10k", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let hashes = black_box(vec![Blake3Hash::default(); 10000]);
            Blake3Hasher::tree_hash(&hashes).await.unwrap()
        });
    });
}

fn bench_blake3_parallel_chunks(c: &mut Criterion) {
    c.bench_function("blake3_hash_chunks_1000", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let chunks: Vec<&[u8]> = (0..1000)
                .map(|i| {
                    let data = Box::leak(vec![i as u8; 64 * 1024].into_boxed_slice());
                    &data[..]
                })
                .collect();
            Blake3Hasher::hash_chunks(&chunks).await.unwrap()
        });
    });
}

criterion_group!(
    benches,
    bench_blake3_100mb,
    bench_blake3_1mb,
    bench_blake3_tree_hash_1k,
    bench_blake3_tree_hash_10k,
    bench_blake3_parallel_chunks
);
criterion_main!(benches);
