// UI wiring: controls, drag & drop, event handlers

import { parseRule, ruleToStrings, formatClassic, isHexRule } from './ruleEncoding.js';
import QRCode from 'qrcode';

export function setupUI(hooks) {
    const {
        loadPrimitive,
        loadFile,
        play,
        pause,
        step,
        reset,
        setSpeed,
        setRule,
        randomize,
        clear,
        setBgColor,
        setDeadColor,
        setCellColor,
        setAgeColor,
        randomizeColors,
        onCanvasClick,
        onCanvasMove,
        onCanvasLeave,
        setPaintMode,
        setBrushSize,
        setBrushDensity,
        setBrushContinuous,
        loadImageFile,
        loadImageUrl,
        applyImage,
        onImagePreview,
        onStateChange
    } = hooks;

    // Primitive select
    document.getElementById('load-primitive').addEventListener('click', () => {
        const type = document.getElementById('primitive-select').value;
        loadPrimitive(type, getDetail());
        notifyStateChange();
    });

    // Detail slider: the slider position is an exponent, so the value is
    // always a power of two (2^0 = 1 through 2^8 = 256).
    const detailSlider = document.getElementById('detail-slider');
    const detailValue = document.getElementById('detail-value');
    const getDetail = () => Math.pow(2, parseInt(detailSlider.value, 10));
    const setDetail = (d) => {
        const exp = Math.round(Math.log2(Math.max(1, d)));
        detailSlider.value = Math.min(8, Math.max(0, exp));
        detailValue.textContent = getDetail();
    };
    detailSlider.addEventListener('input', () => {
        detailValue.textContent = getDetail();
        notifyStateChange();
    });

    // File input
    const fileInput = document.getElementById('file-input');
    const fileBtn = document.getElementById('file-btn');
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            loadFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Drag & drop on canvas
    const canvas = document.getElementById('canvas');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        canvas.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach(evt => {
        canvas.addEventListener(evt, () => canvas.classList.add('drag-over'));
    });
    ['dragleave', 'drop'].forEach(evt => {
        canvas.addEventListener(evt, () => canvas.classList.remove('drag-over'));
    });
    canvas.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        const ext = file ? file.name.toLowerCase().split('.').pop() : '';
        if (['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx'].includes(ext)) {
            loadFile(file);
        }
    });

    // Simulation controls
    document.getElementById('play-btn').addEventListener('click', play);
    document.getElementById('pause-btn').addEventListener('click', pause);
    document.getElementById('step-btn').addEventListener('click', step);
    document.getElementById('reset-btn').addEventListener('click', reset);

    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.addEventListener('input', (e) => {
        speedValue.textContent = e.target.value;
        setSpeed(parseInt(e.target.value, 10));
    });

    // Rule grid: one row per neighbor count, with independent B and S toggles.
    // The range extends to the mesh's maximum neighbor count, which can exceed 8.
    const ruleGrid = document.getElementById('rule-grid');
    const ruleDisplay = document.getElementById('rule-display');
    const rulePreset = document.getElementById('rule-preset');
    const ruleTooltip = document.getElementById('rule-tooltip');
    let currentRule = { birth: new Set([3]), survive: new Set([2, 3]) };
    let maxNeighbors = 8;

    // Notify the host whenever a URL-relevant setting changes. Also lets the
    // QR field follow the URL once it's wired up (see qrSync below).
    let qrSync = null;
    function notifyStateChange() {
        if (onStateChange) onStateChange();
        if (qrSync) qrSync();
    }

    // Descriptions for each preset rule
    const RULE_DESCRIPTIONS = {
        'custom': 'Your own custom rule. Toggle the B (birth) and S (survive) circles below to define when cells are born and when they stay alive.',
        'B3/S23': "Conway's Life — the original. Chaotic and balanced, supporting gliders, oscillators, and still lifes.",
        'B36/S23': 'HighLife — Life plus birth on 6 neighbors. Famous for its self-replicating "replicator" pattern.',
        'B3678/S34678': 'Day & Night — symmetric: dead and alive cells behave the same. Very active and fills space quickly.',
        'B2/S': 'Seeds — nothing ever survives; every generation is born fresh. Explosive, fast-moving patterns.',
        'B3/S012345678': 'Life without Death — cells never die. Grows forever into fractal-like structures.',
        'B3/S12345': 'Maze — grows into maze- and cave-like corridors.',
        'B35678/S5678': 'Diamoeba — forms large, irregular diamond-shaped blobs that pulse and grow.',
        'B36/S125': '2x2 — named for its common 2x2 block oscillator. Produces large, slow-moving patterns.',
        'B1357/S1357': 'Replicator — every pattern copies itself. Highly chaotic and self-replicating.',
        'B3/S45678': 'Coral — grows slowly into branching, coral-like structures.',
        'B1/S1': 'Gnarl — a single neighbor is enough. Produces intricate, gnarly growth.',
        'B368/S245': 'Move — patterns tend to drift and travel across the grid.',
        'B357/S238': 'Pseudo Life — similar to Life but with subtly different, less stable behavior.',
        'B3678/S235678': 'Stains — spreads into large, stable stained regions.',
        'B5678/S45678': 'Vote — majority rule: cells follow their neighbors. Smooths into blobs.',
        'B234/S': 'Serviettes — nothing survives; births on 2-4 neighbors. Grows into napkin-like patterns.',
        'B345/S456': 'Anneal — tends to smooth and anneal patterns into stable blobs.',
        'B345/S45678': 'Life 34 — a variant of Life that grows into large, stable structures.',
        'B345/S4567': 'Life 34 (variant) — similar to Life 34 but with slightly different growth patterns.'
        };

    function updateTooltip() {
        const desc = RULE_DESCRIPTIONS[rulePreset.value] || RULE_DESCRIPTIONS['custom'];
        ruleTooltip.textContent = desc;
    }

    function buildRuleGrid() {
        ruleGrid.innerHTML = '';
        for (let n = 0; n <= displayMax(); n++) {
            const row = document.createElement('div');
            row.className = 'rule-row';

            const num = document.createElement('span');
            num.className = 'rule-num';
            num.textContent = n;
            row.appendChild(num);

            row.appendChild(makeRadio(`b${n}`, 'B', 'birth', n));
            row.appendChild(makeRadio(`s${n}`, 'S', 'survive', n));

            ruleGrid.appendChild(row);
        }
    }

    function makeRadio(name, labelText, ruleKey, n) {
        const label = document.createElement('label');
        label.className = 'rule-radio';

        // Checkbox styled as a radio: toggles natively and can be turned off.
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = name;
        input.checked = currentRule[ruleKey].has(n);
        // Metadata used by the shared apply function and the drag painter.
        input.dataset.ruleKey = ruleKey;
        input.dataset.n = n;

        // Keyboard/native activation (mouse is handled by the drag painter).
        input.addEventListener('change', () => {
            applyRadio(input, input.checked);
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(labelText));
        return label;
    }

    // Apply a checkbox's state to the current rule and refresh the display.
    // Looks up the set at call time: selecting a preset replaces currentRule,
    // so capturing the set earlier would go stale.
    function applyRadio(input, checked) {
        const ruleKey = input.dataset.ruleKey;
        const n = parseInt(input.dataset.n, 10);
        const set = currentRule[ruleKey];
        if (checked) {
            set.add(n);
        } else {
            set.delete(n);
        }
        updateRuleDisplay();
    }

    // --- Click-and-drag painting for the rule grid -------------------------
    // Pressing a B/S circle picks a paint value (the opposite of its current
    // state) and applies it; dragging across other circles applies the same
    // value, so a whole run can be set in one gesture.
    let isPainting = false;
    let paintValue = false;

    function radioInputFromEvent(e) {
        const label = e.target.closest('.rule-radio');
        return label ? label.querySelector('input[type="checkbox"]') : null;
    }

    ruleGrid.addEventListener('mousedown', (e) => {
        const input = radioInputFromEvent(e);
        if (!input) return;
        // Prevent native toggle and text selection; we drive the state here.
        e.preventDefault();
        input.focus();
        isPainting = true;
        paintValue = !input.checked;
        input.checked = paintValue;
        applyRadio(input, paintValue);
        ruleGrid.classList.add('painting');
    });

    ruleGrid.addEventListener('mouseover', (e) => {
        if (!isPainting) return;
        const input = radioInputFromEvent(e);
        if (!input || input.checked === paintValue) return;
        input.checked = paintValue;
        applyRadio(input, paintValue);
    });

    // Stop painting wherever the mouse is released.
    window.addEventListener('mouseup', () => {
        isPainting = false;
        ruleGrid.classList.remove('painting');
    });

    // Suppress the label's click-forwarding for mouse clicks (which would
    // re-toggle the checkbox we already handled on mousedown). Keyboard
    // activation has detail === 0 and is left to the native change handler.
    ruleGrid.addEventListener('click', (e) => {
        if (e.detail > 0 && e.target.closest('.rule-radio')) {
            e.preventDefault();
        }
    });

    // Canonical form used to compare rules regardless of notation, so that
    // "B3/S23" and "B0x08/S0x0C" are treated as the same rule.
    function canonicalRule(ruleString) {
        const { birth, survive } = parseRule(ruleString);
        return `B${formatClassic(birth)}/S${formatClassic(survive)}`;
    }

    // The grid shows counts up to the mesh's max neighbor count, but extends
    // further if the current rule references higher counts, so out-of-range
    // flags remain visible and editable rather than being silently dropped.
    function displayMax() {
        const maxSet = Math.max(0, ...currentRule.birth, ...currentRule.survive);
        return Math.max(maxNeighbors, maxSet);
    }

    function syncGridFromRule() {
        for (let n = 0; n <= displayMax(); n++) {
            const b = ruleGrid.querySelector(`input[name="b${n}"]`);
            const s = ruleGrid.querySelector(`input[name="s${n}"]`);
            if (b) b.checked = currentRule.birth.has(n);
            if (s) s.checked = currentRule.survive.has(n);
        }
    }

    function updateRuleDisplay() {
        const { classic, hex } = ruleToStrings(currentRule);
        ruleDisplay.textContent = `${hex}`;
        hexInput.value = hex;
        setRule(hex);

        // Keep the preset dropdown in sync (falls back to Custom). Preset
        // option values use classic notation, so compare canonically.
        const match = Array.from(rulePreset.options)
            .find(o => o.value !== 'custom' && canonicalRule(o.value) === classic);
        rulePreset.value = match ? match.value : 'custom';
        updateTooltip();
        notifyStateChange();
    }

    buildRuleGrid();

    rulePreset.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'custom') return;
        currentRule = parseRule(value);
        buildRuleGrid();
        syncGridFromRule();
        updateRuleDisplay();
    });

    // Hex rule input: accept a bit-packed rule like "B0x08/S0x0C". Invalid
    // input is rejected (highlighted) and the last good rule is kept.
    const hexInput = document.getElementById('rule-hex');
    hexInput.value = ruleToStrings(currentRule).hex;
    hexInput.addEventListener('change', () => {
        const text = hexInput.value.trim();
        if (!isHexRule(text)) {
            hexInput.classList.add('invalid');
            return;
        }
        hexInput.classList.remove('invalid');
        currentRule = parseRule(text);
        buildRuleGrid();
        syncGridFromRule();
        updateRuleDisplay();
    });

    // Show description on hover over the preset dropdown
    const presetRow = document.getElementById('preset-row');
    const showTooltip = () => {
        updateTooltip();
        ruleTooltip.classList.add('visible');
    };
    const hideTooltip = () => {
        ruleTooltip.classList.remove('visible');
    };

    rulePreset.addEventListener('mouseenter', showTooltip);
    rulePreset.addEventListener('mouseleave', hideTooltip);
    rulePreset.addEventListener('focus', showTooltip);
    rulePreset.addEventListener('blur', hideTooltip);
    presetRow.addEventListener('mouseenter', showTooltip);
    presetRow.addEventListener('mouseleave', hideTooltip);

    updateTooltip();

    document.getElementById('randomize-btn').addEventListener('click', randomize);
    document.getElementById('clear-btn').addEventListener('click', clear);

    // Color pickers
    document.getElementById('bg-color').addEventListener('input', (e) => setBgColor(e.target.value));
    document.getElementById('dead-color').addEventListener('input', (e) => setDeadColor(e.target.value));
    document.getElementById('cell-color').addEventListener('input', (e) => setCellColor(e.target.value));
    document.getElementById('age-color').addEventListener('input', (e) => setAgeColor(e.target.value));
    document.getElementById('randomize-colors-btn').addEventListener('click', randomizeColors);

    // Canvas click for cell toggle
    canvas.addEventListener('click', onCanvasClick);

    // --- Paint mode --------------------------------------------------------
    // When enabled, clicking flips a random subset of the faces within a
    // radius of the clicked face, and hovering outlines that radius.
    const paintModeInput = document.getElementById('paint-mode');
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    const brushDensitySlider = document.getElementById('brush-density');
    const brushDensityValue = document.getElementById('brush-density-value');
    const brushContinuousInput = document.getElementById('brush-continuous');

    paintModeInput.addEventListener('change', () => {
        setPaintMode(paintModeInput.checked);
        canvas.classList.toggle('paint-mode', paintModeInput.checked);
    });
    brushSizeSlider.addEventListener('input', () => {
        brushSizeValue.textContent = brushSizeSlider.value;
        setBrushSize(parseInt(brushSizeSlider.value, 10));
    });
    brushDensitySlider.addEventListener('input', () => {
        brushDensityValue.textContent = brushDensitySlider.value;
        setBrushDensity(parseInt(brushDensitySlider.value, 10) / 100);
    });
    brushContinuousInput.addEventListener('change', () => {
        setBrushContinuous(brushContinuousInput.checked);
    });

    // Pointer tracking for the brush outline (hover) and drag painting.
    canvas.addEventListener('pointermove', (e) => {
        if (onCanvasMove) onCanvasMove(e);
    });
    canvas.addEventListener('pointerleave', () => {
        if (onCanvasLeave) onCanvasLeave();
    });

    // --- Image rasterizer --------------------------------------------------
    // Load a bitmap, then project it onto the mesh faces as the initial state.
    const imageInput = document.getElementById('image-input');
    const imageBtn = document.getElementById('image-btn');
    const imageApplyBtn = document.getElementById('image-apply');
    const imageProjection = document.getElementById('image-projection');
    const imageThreshold = document.getElementById('image-threshold');
    const imageThresholdValue = document.getElementById('image-threshold-value');
    const imageInvert = document.getElementById('image-invert');
    const imageLive = document.getElementById('image-live');

    // Interactive preview: the canvas shows the UV square with the image
    // transformed inside it. Drag to translate, wheel to scale, sliders for
    // scale/rotation/offset. The transform is applied at rasterize time.
    const previewCanvas = document.getElementById('image-preview');
    const previewHint = document.getElementById('image-preview-hint');
    const previewCtx = previewCanvas.getContext('2d');
    const scaleSlider = document.getElementById('image-scale');
    const scaleValue = document.getElementById('image-scale-value');
    const rotationSlider = document.getElementById('image-rotation');
    const rotationValue = document.getElementById('image-rotation-value');
    const offsetXSlider = document.getElementById('image-offset-x');
    const offsetXValue = document.getElementById('image-offset-x-value');
    const offsetYSlider = document.getElementById('image-offset-y');
    const offsetYValue = document.getElementById('image-offset-y-value');
    const imageResetBtn = document.getElementById('image-reset');

    let previewImage = null;
    const transform = { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 };

    // Current image options, shared by Apply and the live preview.
    function imageOptions() {
        return {
            mode: imageProjection.value,
            threshold: parseInt(imageThreshold.value, 10) / 100,
            invert: imageInvert.checked,
            transform: { ...transform }
        };
    }

    // Push the current options to the host for a live on-mesh preview.
    function notifyImagePreview() {
        if (imageLive.checked && onImagePreview) onImagePreview(imageOptions());
    }

    function syncTransformUI() {
        scaleSlider.value = Math.round(transform.scale * 100);
        scaleValue.textContent = Math.round(transform.scale * 100);
        rotationSlider.value = Math.round(transform.rotation * 180 / Math.PI);
        rotationValue.textContent = Math.round(transform.rotation * 180 / Math.PI);
        offsetXSlider.value = Math.round(transform.offsetX * 100);
        offsetXValue.textContent = Math.round(transform.offsetX * 100);
        offsetYSlider.value = Math.round(transform.offsetY * 100);
        offsetYValue.textContent = Math.round(transform.offsetY * 100);
    }

    function drawPreview() {
        const S = previewCanvas.width;
        previewCtx.clearRect(0, 0, S, S);

        // UV square background + border
        previewCtx.fillStyle = '#0a0a0c';
        previewCtx.fillRect(0, 0, S, S);
        previewCtx.strokeStyle = '#444';
        previewCtx.lineWidth = 1;
        previewCtx.strokeRect(0.5, 0.5, S - 1, S - 1);

        if (!previewImage) return;

        // Base size: fit the image inside the UV square at scale 1.
        const fit = Math.min(S / previewImage.width, S / previewImage.height);
        const w = previewImage.width * fit;
        const h = previewImage.height * fit;

        previewCtx.save();
        previewCtx.translate((0.5 + transform.offsetX) * S, (0.5 + transform.offsetY) * S);
        previewCtx.rotate(transform.rotation);
        previewCtx.scale(transform.scale, transform.scale);
        previewCtx.imageSmoothingEnabled = true;
        previewCtx.drawImage(previewImage, -w / 2, -h / 2, w, h);
        previewCtx.restore();

        // Any transform change also refreshes the on-mesh live preview.
        notifyImagePreview();
    }

    function setPreviewImage(img) {
        previewImage = img;
        previewHint.style.display = img ? 'none' : 'flex';
        drawPreview();
        notifyImagePreview();
    }

    // Drag to translate (offset in UV units).
    let dragging = false;
    let dragStart = null;
    previewCanvas.addEventListener('pointerdown', (e) => {
        if (!previewImage) return;
        dragging = true;
        previewCanvas.classList.add('dragging');
        previewCanvas.setPointerCapture(e.pointerId);
        dragStart = { x: e.clientX, y: e.clientY, ox: transform.offsetX, oy: transform.offsetY };
    });
    previewCanvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = previewCanvas.getBoundingClientRect();
        const dx = (e.clientX - dragStart.x) / rect.width;
        const dy = (e.clientY - dragStart.y) / rect.height;
        transform.offsetX = clamp(dragStart.ox + dx, -1, 1);
        transform.offsetY = clamp(dragStart.oy + dy, -1, 1);
        syncTransformUI();
        drawPreview();
    });
    const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        previewCanvas.classList.remove('dragging');
        if (e.pointerId !== undefined && previewCanvas.hasPointerCapture(e.pointerId)) {
            previewCanvas.releasePointerCapture(e.pointerId);
        }
    };
    previewCanvas.addEventListener('pointerup', endDrag);
    previewCanvas.addEventListener('pointercancel', endDrag);

    // Wheel to scale.
    previewCanvas.addEventListener('wheel', (e) => {
        if (!previewImage) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        transform.scale = clamp(transform.scale * factor, 0.1, 4);
        syncTransformUI();
        drawPreview();
    }, { passive: false });

    function clamp(v, lo, hi) {
        return Math.min(hi, Math.max(lo, v));
    }

    scaleSlider.addEventListener('input', () => {
        transform.scale = parseInt(scaleSlider.value, 10) / 100;
        scaleValue.textContent = scaleSlider.value;
        drawPreview();
    });
    rotationSlider.addEventListener('input', () => {
        transform.rotation = parseInt(rotationSlider.value, 10) * Math.PI / 180;
        rotationValue.textContent = rotationSlider.value;
        drawPreview();
    });
    offsetXSlider.addEventListener('input', () => {
        transform.offsetX = parseInt(offsetXSlider.value, 10) / 100;
        offsetXValue.textContent = offsetXSlider.value;
        drawPreview();
    });
    offsetYSlider.addEventListener('input', () => {
        transform.offsetY = parseInt(offsetYSlider.value, 10) / 100;
        offsetYValue.textContent = offsetYSlider.value;
        drawPreview();
    });
    imageResetBtn.addEventListener('click', () => {
        transform.scale = 1;
        transform.rotation = 0;
        transform.offsetX = 0;
        transform.offsetY = 0;
        syncTransformUI();
        drawPreview();
    });

    imageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadImageFile(file);
            imageApplyBtn.disabled = false;
        }
        e.target.value = '';
    });

    // QR code generator: render the text/URL to a PNG data URL, then feed it
    // through the same image pipeline as a chosen file.
    const qrText = document.getElementById('qr-text');
    const qrGenerateBtn = document.getElementById('qr-generate');
    const qrCurrentBtn = document.getElementById('qr-current');

    // Default the QR text to the current page URL so the code links back to
    // this exact setup (the URL already encodes primitive/detail/rule).
    // Once the user types their own text we stop auto-syncing.
    let qrUserEdited = false;
    function setQrToCurrentUrl(force = false) {
        if (force || !qrUserEdited) qrText.value = location.href;
    }
    qrText.addEventListener('input', () => { qrUserEdited = true; });
    setQrToCurrentUrl();
    // Keep the QR field following the page URL as settings change, until the
    // user types their own text.
    qrSync = () => setQrToCurrentUrl();

    async function generateQr() {
        const text = qrText.value.trim();
        if (!text) return;
        try {
            const dataUrl = await QRCode.toDataURL(text, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 512,
                color: { dark: '#000000ff', light: '#ffffffff' }
            });
            // QR codes read best as a flat, centered stamp: default to the
            // front planar projection at 50% scale.
            imageProjection.value = 'front';
            transform.scale = 0.5;
            syncTransformUI();
            drawPreview();
            loadImageUrl(dataUrl);
            imageApplyBtn.disabled = false;
        } catch (err) {
            console.error('[mesh-of-life] QR generation failed:', err);
        }
    }

    qrGenerateBtn.addEventListener('click', generateQr);
    qrCurrentBtn.addEventListener('click', () => {
        setQrToCurrentUrl(true);
        generateQr();
    });
    imageThreshold.addEventListener('input', () => {
        imageThresholdValue.textContent = imageThreshold.value;
        notifyImagePreview();
    });
    imageProjection.addEventListener('change', notifyImagePreview);
    imageInvert.addEventListener('change', notifyImagePreview);
    imageLive.addEventListener('change', () => {
        if (imageLive.checked) {
            notifyImagePreview();
        } else if (onImagePreview) {
            // Turning live preview off restores the pre-preview state.
            onImagePreview(null);
        }
    });
    imageApplyBtn.addEventListener('click', () => {
        applyImage(imageOptions());
    });

    syncTransformUI();
    drawPreview();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        // Ignore when a modifier is held so browser shortcuts (Ctrl/Cmd+C to
        // copy, Ctrl+R to reload, etc.) are not hijacked by the game controls.
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        switch (e.key) {
            case ' ': e.preventDefault(); play(); break;
            case 'p': pause(); break;
            case 's': step(); break;
            case 'r': reset(); break;
            case 'R': randomize(); break;
            case 'c': clear(); break;
        }
    });

    // Return update functions for the main loop
    return {
        updateStats: (faceCount, avgNeighbors, gen, alive) => {
            document.getElementById('face-count').textContent = faceCount;
            document.getElementById('avg-neighbors').textContent = avgNeighbors.toFixed(1);
            document.getElementById('gen-count').textContent = gen;
            document.getElementById('alive-count').textContent = alive;
        },
        // Rebuild the rule grid to cover up to the mesh's max neighbor count.
        // Counts above the mesh max are kept (the grid extends via displayMax)
        // so rules referencing higher counts stay visible and editable.
        setMaxNeighbors: (max) => {
            const newMax = Math.max(8, max);
            if (newMax === maxNeighbors) return;
            maxNeighbors = newMax;
            buildRuleGrid();
            syncGridFromRule();
            updateRuleDisplay();
        },
        // Re-apply the currently selected rule (used after loading a new mesh,
        // since that creates a fresh engine with default settings).
        reapplyRule: () => {
            setRule(ruleToStrings(currentRule).hex);
        },
        // Read/write the URL-relevant settings.
        getState: () => ({
            primitive: document.getElementById('primitive-select').value,
            detail: getDetail(),
            rule: ruleToStrings(currentRule).hex
        }),
        setState: (state) => {
            if (state.primitive) {
                document.getElementById('primitive-select').value = state.primitive;
            }
            if (state.detail) setDetail(state.detail);
            if (state.rule) {
                currentRule = parseRule(state.rule);
                buildRuleGrid();
                syncGridFromRule();
                updateRuleDisplay();
            }
        },
        setPlaying: (isPlaying) => {
            document.getElementById('play-btn').disabled = isPlaying;
            document.getElementById('pause-btn').disabled = !isPlaying;
        },
        // Show a decoded image in the transform preview.
        setPreviewImage: (img) => setPreviewImage(img)
    };
}