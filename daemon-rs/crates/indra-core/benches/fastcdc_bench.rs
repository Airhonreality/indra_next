use criterion::{black_box, criterion_group, criterion_main, Criterion};
use indra_core::FastCdcChunker;

fn bench_fastcdc_50mb(c: &mut Criterion) {
    c.bench_function("fastcdc_50mb", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let chunker = FastCdcChunker::new_standard();
            let data = black_box(vec![0x42u8; 50 * 1024 * 1024]);
            let _ = chunker.chunk(&data).await;
        });
    });
}

fn bench_fastcdc_1mb(c: &mut Criterion) {
    c.bench_function("fastcdc_1mb", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let chunker = FastCdcChunker::new_standard();
            let data = black_box(vec![0x42u8; 1024 * 1024]);
            let _ = chunker.chunk(&data).await;
        });
    });
}

fn bench_fastcdc_random_data(c: &mut Criterion) {
    c.bench_function("fastcdc_10mb_random", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap()).iter(|| async {
            let chunker = FastCdcChunker::new_standard();
            let data: Vec<u8> = (0..10 * 1024 * 1024)
                .map(|i| ((i ^ 0xdeadbeef) % 256) as u8)
                .collect();
            let _ = chunker.chunk(&data).await;
        });
    });
}

criterion_group!(
    benches,
    bench_fastcdc_50mb,
    bench_fastcdc_1mb,
    bench_fastcdc_random_data
);
criterion_main!(benches);
