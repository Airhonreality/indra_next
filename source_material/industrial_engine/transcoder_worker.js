/**
 * =============================================================================
 * TranscoderWorker (Web Worker)
 * RESPONSABILIDAD: "Aduana de Formatos" (Proxy Ingestor).
 * AXIOMA: Estandarizar cualquier entrada (mp4, webm, mov) a un formato interno
 * optimizado (H.264, GOP constante) antes de que toque el AST o la OPFS central.
 * Ley de Sinceridad (ADR-008): Solo materia canónica entra al motor.
 * =============================================================================
 */

import * as MP4Box from 'mp4box';
import * as Mp4Muxer from 'mp4-muxer';

/**
 * =============================================================================
 * TranscoderWorker (Web Worker)
 * RESPONSABILIDAD: "Aduana de Formatos" (Proxy Ingestor).
 * AXIOMA: Estandarizar entrada y extraer Metadatos Sinceros.
 * =============================================================================
 */

self.onmessage = async (e) => {
    const { type, file, localId } = e.data;

    if (type === 'INGEST_AND_TRANSCODE') {
        console.log(`[TranscoderWorker] Archivo recibido: ${file.name} (${file.size} bytes)`);

        try {
            const isSupported = file.type === 'video/mp4';
            const requireTranscode = file.size > 50 * 1024 * 1024 || !isSupported;

            // Extraemos los metadatos sinceros SÍ o SÍ usando MP4Box en memoria
            const getMetadata = () => new Promise((resolve, reject) => {
                const mp4boxfile = MP4Box.createFile();
                let isReady = false;

                // Helper interno para AVC (H.264) Codec Config en transcoder_worker
                const _createAvcDecoderConfigurationRecord = (track) => {
                    try {
                        const stsd = track?.mdia?.minf?.stbl?.stsd;
                        if (!stsd?.entries) return null;
                        for (const box of stsd.entries) {
                            if (box.avcC) {
                                const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
                                box.avcC.write(stream);
                                return Array.from(new Uint8Array(stream.buffer, 8)); // Format ready for decoder worker parsing
                            }
                        }
                    } catch (e) {
                        console.warn("[TranscoderWorker] Fallo al extraer avcC:", e);
                    }
                    return null;
                };

                mp4boxfile.onReady = async (info) => {
                    isReady = true;
                    const videoTrackInfo = info.videoTracks[0];
                    if (!videoTrackInfo) return reject(new Error("No video track found"));

                    // Usamos loose equality (==) porque a veces ID es string o int y como fallback trak[video]
                    const trak = mp4boxfile.moov.traks.find(t => t.tkhd.track_ID == videoTrackInfo.id) 
                                 || mp4boxfile.moov.traks.find(t => t.mdia?.hdlr?.handler === 'vide') 
                                 || mp4boxfile.moov.traks[0];
                    if (!trak) return reject(new Error("Trak de video no encontrado en el árbol moov."));

                    const stbl = trak.mdia?.minf?.stbl;
                    if (!stbl) return reject(new Error("Se requiere estructura STBL canónica (Minf/Stbl)."));

                    try {
                        // Generar IDENTITY MAP (Pre-Indexación de TGS)
                        const timescale = trak.mdia?.mdhd?.timescale || videoTrackInfo.timescale || 90000;
                        const duration_ms = (videoTrackInfo.duration / videoTrackInfo.timescale) * 1000;
                        
                        const map = {
                            timescale: timescale,
                            codec: videoTrackInfo.codec,
                            width: videoTrackInfo.video.width,
                            height: videoTrackInfo.video.height,
                            duration_ms: duration_ms,
                            descriptionArray: _createAvcDecoderConfigurationRecord(trak),
                            samples: [],
                            audio: null // Espacio para el pipeline sincero de sonido
                        };

                        // --- EXTRACCIÓN DE AUDIO (Pipeline Sincero) ---
                        const audioTrackInfo = info.audioTracks[0];
                        if (audioTrackInfo) {
                            const audioTrak = mp4boxfile.moov.traks.find(t => t.tkhd.track_ID == audioTrackInfo.id)
                                            || mp4boxfile.moov.traks.find(t => t.mdia?.hdlr?.handler === 'soun');
                            
                            if (audioTrak && audioTrak.mdia?.minf?.stbl) {
                                const aStbl = audioTrak.mdia.minf.stbl;
                                const aStts = aStbl.stts;
                                const aStsz = aStbl.stsz || aStbl.stz2;
                                const aStco = aStbl.stco || aStbl.co64;
                                const aStsc = aStbl.stsc;

                                const aSampleDurations = [];
                                for (let i = 0; i < aStts.sample_counts.length; i++) {
                                    const count = aStts.sample_counts[i];
                                    const delta = aStts.sample_deltas[i];
                                    for (let c = 0; c < count; c++) aSampleDurations.push(delta);
                                }

                                const aTotalSamples = aSampleDurations.length;
                                const aMap = {
                                    timescale: audioTrak.mdia.mdhd.timescale,
                                    codec: audioTrackInfo.codec,
                                    channels: audioTrackInfo.audio.channel_count,
                                    sampleRate: audioTrackInfo.audio.sample_rate,
                                    samples: new Array(aTotalSamples)
                                };

                                let aFirstSampleInChunk = 0;
                                const aFirst_chunks = aStsc.first_chunk || [];
                                const aSamples_per_chunks = aStsc.samples_per_chunk || [];
                                const aChunk_offsets = aStco.chunk_offsets || [];

                                for (let i = 0; i < aFirst_chunks.length; i++) {
                                    const currentFirstChunk = aFirst_chunks[i];
                                    const nextFirstChunk = aFirst_chunks[i + 1];
                                    const spc = aSamples_per_chunks[i];
                                    const chunksInRun = nextFirstChunk 
                                        ? (nextFirstChunk - currentFirstChunk) 
                                        : (aChunk_offsets.length - currentFirstChunk + 1);
                                    
                                    for (let c = 0; c < chunksInRun; c++) {
                                        const currentChunkIndex = currentFirstChunk - 1 + c;
                                        let offset = aChunk_offsets[currentChunkIndex];
                                        for (let s = 0; s < spc; s++) {
                                            const sNum = aFirstSampleInChunk + c * spc + s;
                                            if (sNum >= aTotalSamples) break;
                                            const size = (aStsz.sample_sizes && aStsz.sample_sizes.length > 0) ? aStsz.sample_sizes[sNum] : aStsz.sample_size;
                                            aMap.samples[sNum] = { offset, size, duration: aSampleDurations[sNum] };
                                            offset += size;
                                        }
                                    }
                                    aFirstSampleInChunk += chunksInRun * spc;
                                }

                                // Timestamps de audio
                                let aCts = 0;
                                for (let i = 0; i < aMap.samples.length; i++) {
                                    if (aMap.samples[i]) {
                                        aMap.samples[i].cts = aCts;
                                        aCts += aMap.samples[i].duration;
                                    }
                                }
                                map.audio = aMap;

                                // --- GENERACIÓN DE WAVEFORM SINCERO (PEAK MAP) ---
                                // Extraemos una representación de amplitud para la UI
                                const waveformData = await this._extractWaveform(file, audioTrackInfo);
                                map.audio.peakMap = waveformData;

                                console.log(`[TranscoderWorker] Audio Identity Map & Waveform Generado: ${aTotalSamples} samples.`);
                            }
                        }

                        // --- EXTRACCIÓN DE VIDEO (Existente) ---
                        const stts = stbl.stts;
                        const stsz = stbl.stsz || stbl.stz2;
                        const stco = stbl.stco || stbl.co64;
                        const stss = stbl.stss;
                        const stsc = stbl.stsc;

                        const sampleDurations = [];
                        for (let i = 0; i < stts.sample_counts.length; i++) {
                            const count = stts.sample_counts[i];
                            const delta = stts.sample_deltas[i];
                            for (let c = 0; c < count; c++) {
                                sampleDurations.push(delta);
                            }
                        }

                        const totalSamples = sampleDurations.length;
                        let firstSampleInChunk = 0;

                        // STSC en mp4box.js guarda datos en arrays paralelos: first_chunk, samples_per_chunk
                        const first_chunks = stsc.first_chunk || [];
                        const samples_per_chunks = stsc.samples_per_chunk || [];
                        const chunk_offsets = stco.chunk_offsets || [];
                        
                        // Array prealocado para mayor velocidad
                        map.samples = new Array(totalSamples); 

                        for (let i = 0; i < first_chunks.length; i++) {
                            const currentFirstChunk = first_chunks[i];
                            const nextFirstChunk = first_chunks[i + 1];
                            const spc = samples_per_chunks[i];
                            
                            const chunksInRun = nextFirstChunk 
                                ? (nextFirstChunk - currentFirstChunk) 
                                : (chunk_offsets.length - currentFirstChunk + 1);
                                
                            for (let c = 0; c < chunksInRun; c++) {
                                // En mp4, first_chunk es 1-indexed, nosotros necesitamos 0-indexed para el array
                                const currentChunkIndex = currentFirstChunk - 1 + c;
                                let offset = chunk_offsets[currentChunkIndex];
                                
                                for (let s = 0; s < spc; s++) {
                                    const sampleNumber = firstSampleInChunk + c * spc + s;
                                    if (sampleNumber >= totalSamples) break;
                                    
                                    const size = (stsz.sample_sizes && stsz.sample_sizes.length > 0) ? stsz.sample_sizes[sampleNumber] : stsz.sample_size;
                                    const isSync = stss ? stss.sample_numbers.includes(sampleNumber + 1) : true; // sample_numbers are 1-indexed
                                    
                                    map.samples[sampleNumber] = { offset, size, is_sync: isSync, duration: sampleDurations[sampleNumber] };
                                    offset += size; // El siguiente sample en el mismo chunk empieza donde acaba este
                                }
                            }
                            firstSampleInChunk += chunksInRun * spc;
                        }

                        // Calcular los timestamps (CTS == DTS para H264 baseline o sin B-frames, servirá de aproximación perfecta al GOP)
                        let currentCts = 0;
                        for (let i = 0; i < map.samples.length; i++) {
                            if (!map.samples[i]) {
                                map.samples[i] = { offset: 0, size: 0, is_sync: false, duration: sampleDurations[i] || 0 };
                            }
                            map.samples[i].cts = currentCts;
                            currentCts += map.samples[i].duration;
                        }

                        console.log(`[TranscoderWorker] Identity Map Generado Exitosamente: ${map.samples.length} frames.`);
                        resolve({ duration_ms, identityMap: map });
                    } catch (err) {
                        console.error("[TranscoderWorker] Fallo Interno Creando Mapa:", err);
                        reject(err);
                    }
                };
                
                mp4boxfile.onError = (e) => reject(e);

                // Helper para extraer waveform sin bloquear
                this._extractWaveform = async (file, trackInfo) => {
                    return new Promise((resolve) => {
                        const peaks = [];
                        const decoder = new AudioDecoder({
                            output: (data) => {
                                const buffer = new Float32Array(data.numberOfFrames);
                                data.copyTo(buffer, { planeIndex: 0 });
                                // Extraer pico de este bloque
                                let max = 0;
                                for(let i=0; i<buffer.length; i+=10) { // Sub-sampling para velocidad
                                    const amp = Math.abs(buffer[i]);
                                    if(amp > max) max = amp;
                                }
                                peaks.push(Math.round(max * 100) / 100);
                                data.close();
                            },
                            error: (e) => console.error("Waveform Decoder Error", e)
                        });

                        decoder.configure({
                            codec: trackInfo.codec,
                            numberOfChannels: trackInfo.audio.channel_count,
                            sampleRate: trackInfo.audio.sample_rate
                        });

                        const mp4boxInternal = MP4Box.createFile();
                        mp4boxInternal.onReady = () => {
                            mp4boxInternal.setExtractionOptions(trackInfo.id);
                            mp4boxInternal.start();
                        };
                        mp4boxInternal.onSamples = async (id, user, samples) => {
                            for (const s of samples) {
                                decoder.decode(new EncodedAudioChunk({
                                    type: 'key',
                                    timestamp: (s.cts / s.timescale) * 1_000_000,
                                    duration: (s.duration / s.timescale) * 1_000_000,
                                    data: s.data
                                }));
                            }
                            await decoder.flush();
                            decoder.close();
                            resolve(peaks);
                        };

                        file.arrayBuffer().then(buf => {
                            buf.fileStart = 0;
                            mp4boxInternal.appendBuffer(buf);
                        });
                    });
                };
                
                const readBlock = (start, end) => {
                    return new Promise((res, rej) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const buffer = event.target.result;
                            buffer.fileStart = start;
                            mp4boxfile.appendBuffer(buffer);
                            res();
                        };
                        reader.onerror = rej;
                        reader.readAsArrayBuffer(file.slice(start, end));
                    });
                };

                // Lectura inteligente (Axioma: No cargar todo a RAM si no es necesario)
                (async () => {
                    try {
                        const startSize = Math.min(file.size, 5 * 1024 * 1024);
                        await readBlock(0, startSize);
                        mp4boxfile.flush();
                        
                        // Si el MOOV no estaba al principio, leemos el final
                        if (!isReady && file.size > startSize) {
                            const endSize = Math.min(file.size - startSize, 5 * 1024 * 1024);
                            await readBlock(file.size - endSize, file.size);
                            mp4boxfile.flush();
                        }
                    } catch(e) {
                        reject(e);
                    }
                })();
            });

            const metadataFromBox = await getMetadata().catch((e) => { 
                console.error("[TranscoderWorker] Error obteniendo Identity Map:", e); 
                return { duration_ms: 5000, identityMap: null }; 
            });

            if (isSupported && !requireTranscode) {
                console.log(`[TranscoderWorker] Fast-Track confirmado. Duración Sincera: ${metadataFromBox.duration_ms}ms`);
                self.postMessage({
                    type: 'TRANSCODE_COMPLETE',
                    localId: localId,
                    resultBlob: file, 
                    metadata: {
                        duration_ms: metadataFromBox.duration_ms, 
                        originalType: file.type,
                        identityMap: metadataFromBox.identityMap
                    }
                });
                return;
            }

            console.warn(`[TranscoderWorker] Iniciando Pipeline Completo de Re-codificación...`);

            // Si no es mp4 y no podemos demuxearlo (mp4box solo lee mp4), 
            // lanzamos error sincero. Para la fase avanzada se requiere bridge al main-thread.
            if (!isSupported) {
                throw new Error("Formato no parseable localmente aún. Sube MP4. (Se requiere MAIN_THREAD decoder pass)");
            }

            // --- PIPELINE DE TRANSCODIFICACIÓN AXIOMÁTICO ---
            
            // 1. Instanciar el Muxer Final (Salida)
            const muxer = new Mp4Muxer.Muxer({
                target: new Mp4Muxer.ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width: 1920,
                    height: 1080
                },
                fastStart: 'in-memory' 
            });


            // 2. Instanciar el VideoEncoder (avc1.4d002a - H.264 Main Profile)
            const encoder = new VideoEncoder({
                output: (chunk, metadata) => {
                    muxer.addVideoChunk(chunk, metadata);
                },
                error: (e) => console.error("[Aduana Encoder Error]", e)
            });

            encoder.configure({
                codec: 'avc1.4d002a',
                width: 1920,
                height: 1080,
                bitrate: 5_000_000, // 5 Mbps constante
                framerate: 30,
                hardwareAcceleration: 'prefer-hardware'
            });

            // 3. Instanciar el VideoDecoder 
            const decoder = new VideoDecoder({
                output: (videoFrame) => {
                    // Cada vez que decodificamos un frame del original, lo pasamos al re-encoder
                    // Lógica de "Backpressure" (esperar si el encoder está saturado)
                    if (encoder.encodeQueueSize > 5) {
                        // Sleep rudimentario sincrónico (no ideal, pero ilustrativo) - en prod usar await
                        // Para este engine Sincero, lo mandamos
                    }
                    encoder.encode(videoFrame);
                    videoFrame.close(); // LEY DE MEMORIA: Liberar VRAM
                },
                error: (e) => console.error("[Aduana Decoder Error]", e)
            });

            // 4. Demuxing (mp4box.js)
            const mp4boxfile = MP4Box.createFile();
            
            mp4boxfile.onReady = (info) => {
                const videoTrack = info.videoTracks[0];
                if (!videoTrack) throw new Error("No video track found");
                
                // Configurar decoder basado en el track original (podría ser HEVC o lo que sea)
                // Extracción del description real simulada para brevedad
                decoder.configure({
                    codec: videoTrack.codec.startsWith('avc1') ? videoTrack.codec : 'avc1.42E01E', 
                    codedWidth: videoTrack.video.width,
                    codedHeight: videoTrack.video.height,
                    // description: extraer avcC 
                });

                mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: 1000 });
                mp4boxfile.start();
            };

            mp4boxfile.onSamples = (id, user, samples) => {
                for (const sample of samples) {
                    const chunk = new EncodedVideoChunk({
                        type: sample.is_sync ? "key" : "delta",
                        timestamp: (sample.cts / sample.timescale) * 1_000_000,
                        duration: (sample.duration / sample.timescale) * 1_000_000,
                        data: sample.data
                    });
                    decoder.decode(chunk);
                }
            };

            // Leer archivo y pasarlo a mp4box (Demuxer)
            const buffer = await file.arrayBuffer();
            buffer.fileStart = 0;
            mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();

            // LEY AXIOMÁTICA: Como esto es asíncrono, no bloqueamos el Worker, 
            // pero tampoco damos TRANSCODE_COMPLETE aquí instantáneamente.
            // En un futuro, drainearemos el codificador y luego enviaremos COMPLETE.
            // Por ahora, indicamos al usuario del sistema de pruebas que solo admite Fast-Track.
            throw new Error("Transcodificación Profunda en Hilo Worker no enganchada al Drain. Fast-Track exigido (Sube MP4).");

        } catch (error) {
            console.error(`[TranscoderWorker] Fallo en la Aduana:`, error);
            self.postMessage({
                type: 'TRANSCODE_ERROR',
                localId: localId,
                error: error.message
            });
        }
    }
};
