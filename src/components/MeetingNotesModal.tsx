import { useState, useEffect } from 'react';
import { X, Loader2, ExternalLink, Users, Clock, FileText, Video, Headphones, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface MeetingNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  clientName: string;
  existingTranscriptId?: string;
}

interface TranscriptData {
  id: string;
  title: string;
  date: string;
  duration: number;
  organizer_email: string;
  participants: string[];
  transcript_url?: string;
  audio_url?: string;
  video_url?: string;
  sentences: Array<{
    speaker_name: string;
    text: string;
    start_time: number;
    end_time: number;
  }>;
  summary: {
    overview?: string;
    action_items?: string[];
    keywords?: string[];
  };
}

export default function MeetingNotesModal({ isOpen, onClose, bookingId, clientName, existingTranscriptId }: MeetingNotesModalProps) {
  const [transcriptId, setTranscriptId] = useState('');
  // const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

  const fetchNotes = async (transcriptIdToUse: string) => {
    setFetching(true);
    setError('');
    setTranscriptData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/meeting-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcriptId: transcriptIdToUse }),
      });

      const data = await response.json();

      if (!data.success) {
        if (data.hasTranscriptId === false) {
          setError('');
          setCheckingExisting(false);
        } else {
          throw new Error(data.message || 'Failed to fetch meeting notes');
        }
      } else {
        setTranscriptData(data.data);
        setCheckingExisting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch meeting notes');
      setCheckingExisting(false);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTranscriptId('');
      setError('');
      setTranscriptData(null);
      // setLoading(false);
      setFetching(false);
      setCheckingExisting(false);

      if (existingTranscriptId) {
        setCheckingExisting(true);
        fetchNotes(existingTranscriptId);
      }
    }
  }, [isOpen, existingTranscriptId, bookingId]);

  if (!isOpen) return null;

  const handleFetchNotes = async () => {
    if (!transcriptId.trim()) {
      setError('Please enter a transcript ID');
      return;
    }

    await fetchNotes(transcriptId.trim());
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Meeting Notes</h3>
            <p className="text-sm text-slate-500">For {clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500"
            disabled={fetching}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {checkingExisting ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-orange-500 mb-4" />
              <p className="text-slate-600">Loading meeting notes...</p>
            </div>
          ) : !transcriptData ? (
            <div className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                  <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!existingTranscriptId && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                  No meeting notes found. Please enter a Fireflies transcript ID to fetch meeting notes.
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Enter Fireflies Transcript ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={transcriptId}
                    onChange={(e) => setTranscriptId(e.target.value)}
                    placeholder="e.g., ASxwZxCstx"
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !fetching) {
                        handleFetchNotes();
                      }
                    }}
                    disabled={fetching}
                  />
                  <button
                    onClick={handleFetchNotes}
                    disabled={fetching || !transcriptId.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {fetching ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <FileText size={18} />
                        Get Notes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Title</div>
                  <div className="text-sm font-semibold text-slate-900">{transcriptData.title || 'N/A'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1">Date</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {transcriptData.date ? format(new Date(transcriptData.date), 'MMM d, yyyy • h:mm a') : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Clock size={14} />
                    Duration
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {transcriptData.duration ? formatDuration(transcriptData.duration) : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Users size={14} />
                    Participants
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {transcriptData.participants?.length || 0}
                  </div>
                </div>
              </div>

              {transcriptData.participants && transcriptData.participants.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Participants</div>
                  <div className="flex flex-wrap gap-2">
                    {transcriptData.participants.map((participant, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-semibold"
                      >
                        {participant}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(transcriptData.transcript_url || transcriptData.audio_url || transcriptData.video_url) && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Resources</div>
                  <div className="flex flex-wrap gap-2">
                    {transcriptData.transcript_url && (
                      <a
                        href={transcriptData.transcript_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-xs font-semibold"
                      >
                        <FileText size={14} />
                        Transcript
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {transcriptData.audio_url && (
                      <a
                        href={transcriptData.audio_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-xs font-semibold"
                      >
                        <Headphones size={14} />
                        Audio
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {transcriptData.video_url && (
                      <a
                        href={transcriptData.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-xs font-semibold"
                      >
                        <Video size={14} />
                        Video
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {transcriptData.summary?.overview && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Overview</div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-slate-700">
                    {transcriptData.summary.overview}
                  </div>
                </div>
              )}

              {transcriptData.summary?.action_items && transcriptData.summary.action_items.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Action Items</div>
                  <ul className="space-y-2">
                    {transcriptData.summary.action_items.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3"
                      >
                        <span className="text-orange-600 font-bold mt-0.5">{idx + 1}.</span>
                        <span className="text-sm text-slate-700 flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {transcriptData.summary?.keywords && transcriptData.summary.keywords.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Keywords</div>
                  <div className="flex flex-wrap gap-2">
                    {transcriptData.summary.keywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {transcriptData.sentences && transcriptData.sentences.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Transcript</div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3">
                    {transcriptData.sentences.map((sentence, idx) => (
                      <div key={idx} className="border-b border-slate-200 last:border-b-0 pb-3 last:pb-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-orange-600">{sentence.speaker_name}</span>
                          <span className="text-xs text-slate-500">{formatTime(sentence.start_time)}</span>
                        </div>
                        <p className="text-sm text-slate-700">{sentence.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition"
            disabled={fetching}
          >
            {transcriptData ? 'Close' : 'Cancel'}
          </button>
          {transcriptData && (
            <button
              onClick={() => {
                setTranscriptData(null);
                setTranscriptId('');
                setError('');
              }}
              className="px-4 py-2 text-orange-600 font-semibold hover:bg-orange-50 rounded-lg transition"
            >
              Fetch Another
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
