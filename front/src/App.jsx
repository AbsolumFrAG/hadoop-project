import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const App = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [splitLength, setSplitLength] = useState(3);
  const [selectedSegment, setSelectedSegment] = useState(0);
  const [mode, setMode] = useState("simple");

  const handleFileSelect = (event) => {
    const file = event.target.files[0];

    if (file) {
      setSelectedFile(file);
      setError(null);
      setResults(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Veuillez sélectionner un fichier");
      return;
    }

    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      if (mode === "segments") {
        formData.append("splitLength", splitLength.toString());
      }

      const endpoint = mode === "simple" ? "/api/count" : "/api/count-segments";

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de l'upload: ${response.status}`);
      }

      const data = await response.json();
      setResults(data);
      if (mode === "segments") {
        setSelectedSegment(0);
      }
    } catch (error) {
      setError("Erreur lors de l'upload : " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">
        Analyse de fichier avec Hadoop
      </h2>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => {
              setMode("simple");
              setResults(null);
            }}
            className={`px-4 py-2 rounded-md ${
              mode === "simple"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Comptage simple
          </button>
          <button
            onClick={() => {
              setMode("segments");
              setResults(null);
            }}
            className={`px-4 py-2 rounded-md ${
              mode === "segments"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Comptage par segments
          </button>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="file"
            onChange={handleFileSelect}
            className="file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      text-gray-600"
          />

          {mode === "segments" && (
            <input
              type="number"
              value={splitLength}
              onChange={(e) => setSplitLength(parseInt(e.target.value))}
              min="1"
              className="px-3 py-2 border rounded-md w-32"
              placeholder="Taille segment"
            />
          )}

          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className={`px-4 py-2 rounded-md text-white font-medium
                      ${
                        !selectedFile || isLoading
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700"
                      }`}
          >
            {isLoading ? "Traitement..." : "Analyser"}
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {results && (
        <div className="mt-6">
          {mode === "segments" && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Segments</h3>
              <div className="flex flex-wrap gap-2">
                {results.results.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedSegment(index)}
                    className={`px-3 py-1 rounded-md ${
                      selectedSegment === index
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Segment {index + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white shadow rounded-lg overflow-hidden">
            {mode === "segments" && (
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h4 className="font-medium">
                  Segment {selectedSegment + 1}
                  <span className="text-gray-500 text-sm ml-2">
                    ({results.segmentLength} caractères)
                  </span>
                </h4>
              </div>
            )}

            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mot
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Occurrences
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mode === "simple"
                  ? results.results
                      .sort((a, b) => b.count - a.count)
                      .map((result, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {result.word}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {result.count}
                          </td>
                        </tr>
                      ))
                  : results.results[selectedSegment]?.wordCount
                      .sort((a, b) => b.count - a.count)
                      .map((result, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {result.word}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {result.count}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-gray-600">
            {mode === "simple" && (
              <>
                <p>Nombre total de mots uniques : {results.results.length}</p>
                <p>
                  Nombre total d'occurrences :{" "}
                  {results.results.reduce((acc, curr) => acc + curr.count, 0)}
                </p>
              </>
            )}
            {mode === "segments" && (
              <>
                <p>Nombre total de segments : {results.totalSegments}</p>
                <p>Taille des segments : {results.segmentLength} caractères</p>
                <p>
                  Mots uniques dans le segment actuel :{" "}
                  {results.results[selectedSegment]?.wordCount.length}
                </p>
                <p>
                  Occurrences dans le segment actuel :{" "}
                  {results.results[selectedSegment]?.wordCount.reduce(
                    (acc, curr) => acc + curr.count,
                    0
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
