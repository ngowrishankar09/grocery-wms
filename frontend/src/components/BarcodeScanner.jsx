import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { X, Camera, RefreshCw } from 'lucide-react'

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(null)
  const [lastScanned, setLastScanned] = useState(null)

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader()

    readerRef.current.listVideoInputDevices()
      .then(devices => {
        setCameras(devices)
        // Prefer back camera on mobile
        const back = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        )
        setSelectedCamera(back?.deviceId || devices[0]?.deviceId)
      })
      .catch(e => setError('Camera access denied. Please allow camera permission.'))

    return () => {
      readerRef.current?.reset()
    }
  }, [])

  useEffect(() => {
    if (!selectedCamera || !videoRef.current) return
    startScanning()
  }, [selectedCamera])

  const startScanning = async () => {
    if (!readerRef.current || !videoRef.current) return
    setScanning(true)
    setError(null)

    try {
      await readerRef.current.decodeFromVideoDevice(
        selectedCamera,
        videoRef.current,
        (result, err) => {
          if (result) {
            const code = result.getText()
            if (code !== lastScanned) {
              setLastScanned(code)
              // Flash effect
              videoRef.current?.classList.add('ring-4', 'ring-green-400')
              setTimeout(() => videoRef.current?.classList.remove('ring-4', 'ring-green-400'), 500)
              onScan(code)
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            // Ignore not-found errors (normal when no barcode in frame)
          }
        }
      )
    } catch (e) {
      setError('Could not start camera: ' + e.message)
      setScanning(false)
    }
  }

  const switchCamera = () => {
    readerRef.current?.reset()
    const idx = cameras.findIndex(c => c.deviceId === selectedCamera)
    const next = cameras[(idx + 1) % cameras.length]
    setSelectedCamera(next?.deviceId)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <Camera size={20} className="text-blue-600" />
            Scan Barcode
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Camera view */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="w-full aspect-video object-cover transition-all"
            autoPlay
            playsInline
            muted
          />
          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-32 border-2 border-white rounded-lg opacity-70 relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br" />
              {/* Scan line animation */}
              <div className="absolute inset-x-0 h-0.5 bg-green-400 opacity-80 animate-scan" />
            </div>
          </div>
          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-white text-sm">Starting camera...</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}

          {lastScanned && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs text-green-600 font-medium">Last scanned:</div>
              <div className="font-mono font-bold text-green-800">{lastScanned}</div>
            </div>
          )}

          <p className="text-xs text-gray-500 text-center">
            Point camera at the barcode on the case. It will scan automatically.
          </p>

          <div className="flex gap-2">
            {cameras.length > 1 && (
              <button onClick={switchCamera} className="btn-secondary flex items-center gap-2 flex-1">
                <RefreshCw size={14} /> Switch Camera
              </button>
            )}
            <button onClick={onClose} className="btn-secondary flex-1">Done</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan {
          animation: scan 1.5s linear infinite;
        }
      `}</style>
    </div>
  )
}
