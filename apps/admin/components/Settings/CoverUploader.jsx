import React, { useEffect, useState } from 'react';
import { browserClient } from '../../lib/supabaseClient';

const styles = {
  wrapper: {
    display: 'grid',
    gap: 12,
  },
  preview: {
    maxWidth: 220,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid var(--admin-border-soft)',
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
  },
  fileInput: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'var(--appearance-font-color, var(--admin-body-color))',
    fontSize: 13,
  },
  status: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  error: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: 600,
  },
};

export default function CoverUploader({ coverImage, onChange }) {
  const [client, setClient] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setClient(browserClient());
      setStatus('Ready to upload cover images.');
    } catch (err) {
      setClient(null);
      setStatus('Supabase client not configured. Uploads disabled.');
      setError('');
      console.warn('Unable to initialize Supabase client', err);
    }
  }, []);

  const handleUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!client) {
      setError('Supabase client unavailable.');
      return;
    }

    const path = `covers/${Date.now()}-${file.name}`;
    setIsUploading(true);
    setStatus('Uploading cover image…');
    setError('');

    try {
      const { error: uploadError } = await client.storage.from('media').upload(path, file, { upsert: true });
      if (uploadError) {
        setError(uploadError.message || 'Upload failed.');
        setStatus('');
        return;
      }

      const { data } = client.storage.from('media').getPublicUrl(path) || {};
      const publicUrl = data?.publicUrl || '';
      if (publicUrl && onChange) {
        onChange(publicUrl);
      }
      setStatus(publicUrl ? 'Cover image uploaded.' : 'Upload complete. No public URL returned.');
    } catch (err) {
      setError(err.message || 'Upload failed.');
      setStatus('');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      {coverImage && (
        <div style={styles.preview}>
          <img src={coverImage} alt="Game cover" style={styles.image} />
        </div>
      )}
      <input
        style={styles.fileInput}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={isUploading}
      />
      {status && <div style={styles.status}>{status}</div>}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}
