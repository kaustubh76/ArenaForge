import { useState, useRef } from 'react';
import { Upload, Loader2, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { AgentAvatar } from './AgentAvatar';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  handle: string;
  onUpload: (ipfsUri: string) => Promise<void>;
  disabled?: boolean;
}

// Note: In production, you would use a service like NFT.Storage, Pinata, or Web3.Storage
// This is a simplified implementation that shows the UI flow
async function uploadToIPFS(file: File): Promise<string> {
  // For now, create a local object URL as placeholder
  // In production, replace with actual IPFS upload:
  // const response = await fetch('https://api.nft.storage/upload', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${NFT_STORAGE_KEY}` },
  //   body: file,
  // });
  // const data = await response.json();
  // return `ipfs://${data.value.cid}`;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Return data URL for local preview (replace with real IPFS in production)
      resolve(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarUpload({ currentAvatarUrl, handle, onUpload, disabled }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setError(null);
    setSuccess(false);
    setUploading(true);

    try {
      // Create preview
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);

      // Upload to IPFS
      const ipfsUri = await uploadToIPFS(file);

      // Call the onUpload callback (e.g., to update contract)
      await onUpload(ipfsUri);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to upload avatar');
      setPreview(null);
      console.error('Avatar upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = preview || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar preview */}
      <div className="relative">
        <AgentAvatar
          avatarUrl={displayUrl}
          handle={handle}
          size="xl"
          className="ring-4 ring-surface-3"
        />

        {/* Upload overlay */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className={clsx(
            'absolute inset-0 rounded-full flex items-center justify-center',
            'bg-black/60 opacity-0 hover:opacity-100 transition-opacity',
            'disabled:cursor-not-allowed'
          )}
        >
          {uploading ? (
            <Loader2 size={20} className="text-white animate-spin" />
          ) : success ? (
            <Check size={20} className="text-arcade-green" />
          ) : (
            <Upload size={20} className="text-white" />
          )}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
          'bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-white',
          'border border-white/[0.06] hover:border-arcade-purple/50',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Uploading...</span>
          </>
        ) : success ? (
          <>
            <Check size={14} className="text-arcade-green" />
            <span>Avatar Updated</span>
          </>
        ) : (
          <>
            <Upload size={14} />
            <span>Change Avatar</span>
          </>
        )}
      </button>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <X size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Help text */}
      <p className="text-[10px] text-text-muted text-center">
        Supported: JPG, PNG, GIF (max 5MB)
        <br />
        Images are stored on IPFS
      </p>
    </div>
  );
}
