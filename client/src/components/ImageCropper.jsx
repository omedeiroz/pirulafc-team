import { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Modal } from './ui.jsx';
import { cropImage } from '../utils.js';

// Tamanho final de cada tipo de imagem (e a proporção do recorte).
export const IMAGE_SIZES = {
  avatar: { width: 400, height: 400, round: true, title: 'Ajustar foto' },
  banner: { width: 1600, height: 400, round: false, title: 'Ajustar banner' },
};

// Zoom < 1 permite afastar e caber a foto inteira (a sobra fica transparente).
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5;

// Janela para posicionar (arrastar) e dar zoom (slider / roda do mouse / pinça) antes de enviar.
export default function ImageCropper({ file, kind, onCancel, onConfirm }) {
  const cfg = IMAGE_SIZES[kind];
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!area) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(await cropImage(src, area, cfg));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onCancel} wide={kind === 'banner'}>
      <h2>{cfg.title}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>Arraste para posicionar e use o zoom para enquadrar.</p>
      <div className={`cropper-box cropper-${kind}`}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={cfg.width / cfg.height}
          cropShape={cfg.round ? 'round' : 'rect'}
          showGrid={!cfg.round}
          objectFit="contain"
          restrictPosition={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="zoom-row">
        <button type="button" className="btn-sm" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}>−</button>
        <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom} aria-label="Zoom"
          onChange={(e) => setZoom(Number(e.target.value))} />
        <button type="button" className="btn-sm" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}>+</button>
        <button type="button" className="btn-sm btn-ghost" onClick={() => { setZoom(1); setCrop({ x: 0, y: 0 }); }}>Resetar</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn-primary" onClick={confirm} disabled={busy || !area}>{busy ? 'Enviando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}
