//! COM components for Windows integration

pub mod thumbnail;

pub use thumbnail::{
    get_byte_range_strategy, ByteRangeStrategy, IndraThumbProvider, RangeOffset,
    ThumbnailCache, ThumbnailInfo,
};
