import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  File,
  X,
  ChevronRight,
  Loader2,
  UploadCloud
} from 'lucide-react';

const Home = () => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const [useMongo, setUseMongo] = useState(false);
  const [mongoUri, setMongoUri] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // NEW
  const [mockRows, setMockRows] = useState(10);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);

      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);

      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove)
    );
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleContinue = async () => {
    if (files.length === 0) {
      alert('Please upload at least one schema file.');
      return;
    }

    if (useMongo && !mongoUri.trim()) {
      alert(
        'Please enter a valid MongoDB URI, or uncheck the MongoDB option.'
      );
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('schemas', file));

      formData.append('mockRows', mockRows);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      navigate('/results/studio', {
        state: {
          useMongo,
          mongoUri,
          mockRows
        }
      });
    } catch (error) {
      console.error(error);

      alert(
        'Failed to upload files. Is your backend server running on port 4000?'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-6 pt-28 pb-16 relative z-10 transition-colors duration-300">
      {/* HERO */}
      <div className="text-center mb-16 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 dark:text-brand-300 text-sm font-medium border border-brand-500/20">
          <span className="w-2 h-2 rounded-full bg-pink-500"></span>
          <span>Mockmate Engine v2.0 Live</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
          Generate Mock Data <br />

          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-blue-500 dark:from-brand-400 dark:to-blue-400">
            with Mockmate
          </span>
        </h1>

        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          Design complex database schemas visually,
          define relationships, and generate
          production-grade coherent mock data
          instantly.
        </p>
      </div>

      {/* MAIN CARD */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-3xl p-8 backdrop-blur-xl shadow-2xl">

          {/* UPLOAD ZONE */}
          <div
            className={`border border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300
            ${
              isDragging
                ? 'border-blue-400 bg-blue-500/5'
                : 'border-gray-600 hover:border-blue-400 hover:bg-white/5'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="bg-blue-500/10 p-4 rounded-2xl mb-5">
              <UploadCloud className="w-10 h-10 text-blue-400" />
            </div>

            <h2 className="text-2xl font-semibold mb-2 text-white">
              Upload Schema Files
            </h2>

            <p className="text-gray-400 text-center mb-6 max-w-md">
              Drag & drop your schema files here or
              upload directly from your explorer.
            </p>

            <button
              onClick={triggerFileInput}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 cursor-pointer"
            >
              Add Files
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              accept=".js"
              multiple
            />
          </div>

          {/* FILES LIST */}
          {files.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  Selected Files
                </h3>

                <span className="text-sm text-blue-400 font-medium">
                  {files.length} files
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 hover:border-blue-500/20 transition-colors group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400">
                        <File className="w-5 h-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-medium truncate text-white">
                          {file.name}
                        </p>

                        <p className="text-xs text-gray-400">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MOCK ROWS */}
          <div className="mt-8">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Number of Mock Rows
            </label>

            <input
              type="number"
              min="1"
              value={mockRows}
              onChange={(e) =>
                setMockRows(e.target.value)
              }
              className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="Enter number of rows"
            />

            
          </div>

          {/* MONGODB CONFIG */}
          <div className="mt-8 border border-gray-700 bg-gray-800/30 rounded-2xl p-6">
            <label className="flex items-start gap-4 cursor-pointer">
              <div className="pt-1">
                <input
                  type="checkbox"
                  checked={useMongo}
                  onChange={(e) =>
                    setUseMongo(e.target.checked)
                  }
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  Insert generated data into MongoDB
                </h3>

                <p className="text-sm text-gray-400 mb-4">
                  Automatically seed generated mock
                  data directly into your database.
                </p>

                <input
                  type="text"
                  value={mongoUri}
                  onChange={(e) =>
                    setMongoUri(e.target.value)
                  }
                  disabled={!useMongo}
                  placeholder="mongodb+srv://..."
                  className={`w-full rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    useMongo
                      ? 'bg-white text-gray-900 placeholder-gray-400'
                      : 'bg-gray-700 text-gray-500 placeholder-gray-600 cursor-not-allowed'
                  }`}
                />
              </div>
            </label>
          </div>

          {/* CONTINUE BUTTON */}
          <div className="mt-8">
            <button
              onClick={handleContinue}
              disabled={isUploading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold px-6 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer text-lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading Schemas...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Home;