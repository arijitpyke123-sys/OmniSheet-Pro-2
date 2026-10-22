import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Image as ImageIcon, 
  Upload, 
  Link as LinkIcon, 
  Sparkles, 
  Trash2, 
  Check, 
  Eye, 
  AlertCircle 
} from 'lucide-react';

interface ImageInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetCell: string;
  currentImage?: { url: string; alt?: string; fit?: 'contain' | 'cover' } | null;
  onSaveImage: (cellKey: string, imageData: { url: string; alt?: string; fit?: 'contain' | 'cover' } | null, asFormula?: boolean) => void;
  theme?: 'dark' | 'light';
}

const PRESET_ICONS = [
  { label: 'Growth Chart', url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=150&auto=format&fit=crop&q=60' },
  { label: 'Technology', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=150&auto=format&fit=crop&q=60' },
  { label: 'Finance & Coins', url: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=150&auto=format&fit=crop&q=60' },
  { label: 'Cloud Server', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=150&auto=format&fit=crop&q=60' },
  { label: 'Team Member Avatar', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=OmniTeam' },
  { label: 'Security Shield', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=SecurityPro' },
  { label: 'Verified Badge', url: 'https://api.dicebear.com/7.x/identicon/svg?seed=VerifiedBadge' },
  { label: 'Office Workspace', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=150&auto=format&fit=crop&q=60' }
];

export const ImageInsertModal: React.FC<ImageInsertModalProps> = ({
  isOpen,
  onClose,
  targetCell,
  currentImage,
  onSaveImage,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [altText, setAltText] = useState('');
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [insertAsFormula, setInsertAsFormula] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (isOpen) {
      if (currentImage?.url) {
        setPreviewUrl(currentImage.url);
        setUrlInput(currentImage.url.startsWith('data:') ? '' : currentImage.url);
        setAltText(currentImage.alt || '');
        setFitMode(currentImage.fit || 'contain');
      } else {
        setPreviewUrl(null);
        setUrlInput('');
        setAltText('');
        setFitMode('contain');
      }
      setErrorMsg(null);
    }
  }, [isOpen, currentImage]);

  if (!isOpen) return null;

  // Process uploaded image file and scale to clean thumbnail
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (PNG, JPG, WebP, SVG, GIF)');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      // Resize large images using canvas to prevent Firestore document size overflow
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const optimizedDataUrl = canvas.toDataURL('image/webp', 0.85);
          setPreviewUrl(optimizedDataUrl);
          setAltText(file.name.replace(/\.[^/.]+$/, ''));
        } else {
          setPreviewUrl(dataUrl);
        }
        setIsProcessing(false);
      };
      img.onerror = () => {
        setErrorMsg('Failed to process image file');
        setIsProcessing(false);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) {
      setErrorMsg('Please enter a valid image URL');
      return;
    }
    setErrorMsg(null);
    setPreviewUrl(urlInput.trim());
  };

  const handleSave = () => {
    if (!previewUrl) {
      setErrorMsg('Please upload or select an image first');
      return;
    }

    onSaveImage(
      targetCell,
      {
        url: previewUrl,
        alt: altText.trim() || `Image at ${targetCell}`,
        fit: fitMode,
      },
      insertAsFormula
    );
    onClose();
  };

  const handleRemove = () => {
    onSaveImage(targetCell, null);
    onClose();
  };

  const modalBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const cardBg = isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className={`flex flex-col w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-colors ${modalBg}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Insert Image in Cell {targetCell}</h2>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Embed photo, logo, or diagram into cell grid
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Source Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800/80">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'upload' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </button>
            <button
              onClick={() => setActiveTab('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'url' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              Web URL
            </button>
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'presets' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Curated Gallery
            </button>
          </div>

          {/* TAB 1: FILE UPLOAD */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 px-4 text-center cursor-pointer transition ${
                  isDark 
                    ? 'border-slate-800 bg-slate-950/60 hover:border-emerald-500/60 hover:bg-slate-950' 
                    : 'border-slate-300 bg-slate-50 hover:border-emerald-500 hover:bg-emerald-50/20'
                }`}
              >
                <Upload className="h-8 w-8 text-emerald-500 mb-2 animate-bounce" />
                <p className="text-xs font-bold">Click to browse or drop an image</p>
                <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Supports PNG, JPG, WebP, SVG, and GIF (optimized for cell display)
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: IMAGE URL */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Web Image URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className={`flex-1 rounded-xl px-3.5 py-2 text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inputBg}`}
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 transition"
                >
                  Load
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: CURATED PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-2.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Choose from Business & Analytics Icons
              </label>
              <div className="grid grid-cols-4 gap-2.5">
                {PRESET_ICONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPreviewUrl(preset.url);
                      setAltText(preset.label);
                    }}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border text-center transition group ${
                      previewUrl === preset.url
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : isDark ? 'border-slate-800 bg-slate-950 hover:border-slate-700' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      className="h-10 w-10 object-cover rounded-lg group-hover:scale-105 transition-transform"
                    />
                    <span className="text-[10px] truncate max-w-full font-medium">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PREVIEW CONTAINER */}
          {previewUrl && (
            <div className={`p-3.5 rounded-xl border space-y-3 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
                  <Eye className="h-3.5 w-3.5" />
                  Cell Display Preview
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Target: {targetCell}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center h-20 w-28 rounded-lg border overflow-hidden p-1 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  <img
                    src={previewUrl}
                    alt={altText || 'Preview'}
                    className={`max-h-full max-w-full rounded ${fitMode === 'cover' ? 'object-cover w-full h-full' : 'object-contain'}`}
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Alt Description / Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Q1 Logo or Product Photo"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      className={`w-full rounded-lg px-2.5 py-1 text-xs border focus:outline-none focus:ring-1 focus:ring-emerald-500 mt-0.5 ${inputBg}`}
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Fit Mode:</label>
                    <div className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="fit"
                          checked={fitMode === 'contain'}
                          onChange={() => setFitMode('contain')}
                        />
                        <span>Contain</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="fit"
                          checked={fitMode === 'cover'}
                          onChange={() => setFitMode('cover')}
                        />
                        <span>Cover</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formula toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={insertAsFormula}
                    onChange={(e) => setInsertAsFormula(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Insert as formula <code>=IMAGE("{previewUrl.startsWith('data:') ? 'data:...' : previewUrl}")</code></span>
                </label>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            {currentImage?.url ? (
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition"
              >
                <Trash2 className="h-4 w-4" />
                Remove Image
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!previewUrl || isProcessing}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {isProcessing ? 'Processing...' : 'Apply Image to Cell'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
