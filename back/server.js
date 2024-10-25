const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(cors());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

app.post("/count", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier envoyé" });
  }

  const inputFile = req.file.path;

  try {
    const results = await processWordCount(inputFile);

    fs.unlinkSync(inputFile);

    res.json({ results });
  } catch (error) {
    console.error("Erreur:", error);
    res.status(500).json({ error: "Erreur lors du traitement du fichier" });
  }
});

app.post("/count-segments", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier envoyé" });
  }

  const splitLength = parseInt(req.body.splitLength) || 3;
  const inputFile = req.file.path;

  try {
    const content = fs.readFileSync(inputFile, "utf8");
    const segments = splitIntoSegments(content, splitLength);

    const segmentedContent = segments.join("\n---\n");
    fs.writeFileSync(inputFile, segmentedContent);

    const results = await processSegmentedWordCount(inputFile, segments.length);

    fs.unlinkSync(inputFile);

    res.json({
      totalSegments: segments.length,
      segmentLength: splitLength,
      results: results,
    });
  } catch (error) {
    console.error("Erreur:", error);
    res.status(500).json({ error: "Erreur lors du traitement du fichier" });
  }
});

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Erreur d'exécution: ${error}`);
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function processWordCount(inputFile) {
  const hdfsInputPath = "/wordcount/input";
  const hdfsOutputPath = "/wordcount/output";

  try {
    await executeCommand(
      `hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`
    ).catch(() => {});
    await executeCommand(`hdfs dfs -mkdir -p ${hdfsInputPath}`);
    await executeCommand(`hdfs dfs -put ${inputFile} ${hdfsInputPath}`);
    await executeCommand(
      `hadoop jar /opt/homebrew/Cellar/hadoop/3.4.0/libexec/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.0.jar wordcount ${hdfsInputPath} ${hdfsOutputPath}`
    );

    const resultFile = "result.txt";
    await executeCommand(
      `hdfs dfs -get ${hdfsOutputPath}/part-r-00000 ${resultFile}`
    );

    const results = fs
      .readFileSync(resultFile, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [word, count] = line.split("\t");
        return { word, count: parseInt(count) };
      });

    await executeCommand(`hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`);
    fs.unlinkSync(resultFile);

    return results;
  } catch (error) {
    console.error("Erreur lors du wordcount:", error);
    throw error;
  }
}

async function processSegmentedWordCount(inputFile, numSegments) {
  const hdfsInputPath = "/wordcount/input";
  const hdfsOutputPath = "/wordcount/output";

  try {
    await executeCommand(
      `hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`
    ).catch(() => {});
    await executeCommand(`hdfs dfs -mkdir -p ${hdfsInputPath}`);
    await executeCommand(`hdfs dfs -put ${inputFile} ${hdfsInputPath}`);

    await executeCommand(
      `hadoop jar /opt/homebrew/Cellar/hadoop/3.4.0/libexec/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.0.jar wordcount ${hdfsInputPath} ${hdfsOutputPath}`
    );

    const resultFile = "result.txt";
    await executeCommand(
      `hdfs dfs -get ${hdfsOutputPath}/part-r-00000 ${resultFile}`
    );

    const results = [];
    const fileContent = fs.readFileSync(resultFile, "utf8");
    const wordCounts = new Map();

    fileContent.split("\n").forEach((line) => {
      if (line.trim()) {
        const [word, count] = line.split("\t");
        wordCounts.set(word, parseInt(count));
      }
    });

    for (let i = 0; i < numSegments; i++) {
      const segmentWords = [];
      for (const [word, count] of wordCounts.entries()) {
        if (count > 0) {
          segmentWords.push({ word, count });
        }
      }
      results.push({
        segmentIndex: i,
        wordCount: segmentWords,
      });
    }

    await executeCommand(`hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`);
    fs.unlinkSync(resultFile);

    return results;
  } catch (error) {
    console.error("Erreur lors du traitement des segments:", error);
    throw error;
  }
}

function splitIntoSegments(content, length) {
  const segments = [];
  for (let i = 0; i < content.length; i += length) {
    segments.push(content.slice(i, i + length));
  }
  return segments;
}

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
