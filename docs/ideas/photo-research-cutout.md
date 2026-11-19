# Photo editor: background removal research

Fetched 2026-11-09. Code: `packages/web/src/photo/{cutout,cutout-client,cutout.worker}.ts`, `CutoutDialog.tsx`.

## How it runs (checked in the installed library, @huggingface/transformers 4.3.2)
- `pipeline('background-removal', repo, { dtype, progress_callback })` exists: `node_modules/@huggingface/transformers/src/pipelines/background-removal.js`; docs: https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.BackgroundRemovalPipeline . It calls the image-segmentation pipeline and then `RawImage.putAlpha(mask)` on a clone of the input, so the result is a `RawImage` (RGBA, `channels: 4`) **at the input image's size**, mask in the alpha byte. Our worker takes only that alpha channel (one byte a pixel) and posts it back as a transferable; the page upscales it to the working picture (`resizeMatte`, bilinear) and applies it itself. Input to the worker is `new RawImage(rgba, w, h, 4)` (`RawImage.read` returns a `RawImage` unchanged).
- The image-segmentation step maps a model's single input name to `pixel_values`, applies `sigmoid` when the output is outside 0..1, multiplies by 255 and resizes the mask to the input size.
- `dtype: 'q8'` reads `onnx/model_quantized.onnx` (suffix table in `src/utils/dtypes.js`: `q8 -> '_quantized'`; the default for the wasm device is q8, the same as transcribe). `fp32` reads `onnx/model.onnx`.
- Runtime and files: same as the transcribe feature. Models come from `https://huggingface.co/` (`env.remoteHost`), the browser's Cache API keeps them (`useBrowserCache`, cache name `transformers-cache`), the ONNX runtime wasm comes from `https://cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/` (set in `src/backends/onnx.js`). `vite.config.ts` therefore needs no change: `dropUnusedWasm` already removes the wasm the build would otherwise copy, and nothing new is shipped to the host (deploy only allows html/js/css/svg/png/ico/xml/txt/woff2). The dialog's consent text names both hosts.
- MDN: `createImageBitmap` https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap ; `ImageData` constructor `new ImageData(data, width, height)` https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData ; `canvas.toBlob` https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob ; `ImageBitmap.close()` https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close . (Canvases here are plain DOM canvases on the page; the worker never touches one.)

## Models: licences and sizes (Hugging Face API file lists, `blobs=true`; MB = 10^6 bytes)
| Model | Licence (card) | Files | Verdict |
|---|---|---|---|
| `Xenova/modnet` https://huggingface.co/Xenova/modnet | Apache-2.0 | `model_quantized.onnx` 6.63 MB (= `model_uint8` 6.63 MB), `model_fp16` 12.98 MB, `model.onnx` 25.89 MB | **Default** (portraits). Needs `size.shortest_edge 512` input, `image_mean/std 0.5`. |
| `onnx-community/BiRefNet_lite-ONNX` https://huggingface.co/onnx-community/BiRefNet_lite-ONNX | MIT (base `ZhengPeng7/BiRefNet_lite`, MIT) | `model.onnx` 224.0 MB, `model_fp16.onnx` 114.5 MB; fixed 1024x1024 input | **Fails in the browser here**: `std::bad_alloc` in `OrtRun` on wasm (measured, see below). Not offered. |
| `studioludens/birefnet-lite-512` https://huggingface.co/studioludens/birefnet-lite-512 | MIT (card + LICENSE file; base MIT) | `model.onnx` 191.9 MB, `model_fp16.onnx` 98.5 MB; 512x512 input | The "better" choice if it runs (see measured section). Community re-export, not an onnx-community/Xenova repo; its card says it exists because 1024 variants hit an out-of-memory wall in onnxruntime-web. |
| `onnx-community/BiRefNet-ONNX`, `BiRefNet_512x512-ONNX` | MIT | 973 MB / 940 MB fp32 | Too big. |
| `onnx-community/ormbg-ONNX` https://huggingface.co/onnx-community/ormbg-ONNX | Apache-2.0 (base `schirrmacher/ormbg`, Apache-2.0) | `model_quantized` 44.3 MB, fp32 176 MB | Card of the base model: "optimized for images with humans" (an IS-Net fine-tune). Not better than MODNet for objects by its own description; not tested. |
| `onnx-community/BEN2-ONNX` | MIT | fp16 only, 219 MB | fp16 only: not for the wasm backend; not tested. |
| `onnx-community/MVANet-ONNX` | MIT | `model_quantized` 141 MB, fp32 422 MB | Not tested. |
| `BritishWerewolf/U-2-Netp` (4.57 MB), `BritishWerewolf/IS-Net` (178.6 MB) | Apache-2.0 | | Need a custom `U2NetProcessor` that Transformers.js 4.3.2 does not have as a pipeline task (card shows `AutoModel` + hand-made outputs). Skipped. |
| `onnx-community/ISNet-ONNX` | **AGPL-3.0** | | Do not use. |
| `briaai/RMBG-1.4`, `RMBG-2.0` | `license:other` (non-commercial) | | Do not use. |
| imgly background-removal | AGPL | | Do not use. |

## Measured in Chrome (dev server, one laptop; honest numbers)
Test pictures were fetched from Wikimedia Commons for the run only (an official portrait, the NASA Apollo photo "Buzz salutes the U.S. Flag", a banana on white); none is stored in the repo. Called through `removeBackground` in the dev page, wasm backend, model files already fetched (Cache API), 1280 px inputs.

| Model | Picture | Time after the model was loaded | Result |
|---|---|---|---|
| MODNet q8 (6.6 MB) | portrait | about 2.4 s total | Clean cut of head and suit. |
| MODNet q8 | banana | 1.3 s | **Poor**: about half the banana missing. |
| MODNet q8 | astronaut and flag (small subject) | 1.2 s | **Poor**: flag mostly lost, suit patchy. |
| BiRefNet-lite 512 fp32 (192 MB) | portrait | 6-22 s (the 22 s run included loading the model from the cache) | Clean, about the same as MODNet. |
| BiRefNet-lite 512 | banana | about 6 s | **Clean**, whole fruit with its stalk. |
| BiRefNet-lite 512 | astronaut and flag | about 6 s | **Clean**, figure and flag with its pole, in one subject. |
| BiRefNet-lite 1024 (`onnx-community/BiRefNet_lite-ONNX`, 224 MB) | astronaut | failed | `failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc`. |

First-ever download of the 192 MB model plus a run: 46 s on this connection. Caveats: edges were not inspected at pixel level (hair, fur, glass, motion blur); a matte at 512 px is upscaled bilinearly, so fine detail like hair is softer than the picture; no WebGPU was tried (the worker uses the library default, wasm, like transcribe); Safari, Firefox, phones and low-memory devices were not run. The 1024 model's out-of-memory is on a laptop with a large wasm heap, so it would be worse on a phone; the 512 model has not been tried on one either.

Decision: **default MODNet q8 (6.6 MB, Apache-2.0)** for people; **"Better" = `studioludens/birefnet-lite-512` fp32 (192 MB, MIT)** for anything else. The dialog says plainly that the quick one is a portrait model.
