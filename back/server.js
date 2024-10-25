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

app.post(
  "/space-and-count/:spacing",
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier envoyé" });
    }

    const spacing = parseInt(req.params.spacing);
    if (isNaN(spacing) || spacing <= 0) {
      return res
        .status(400)
        .json({ error: "Le paramètre d'espacement est invalide" });
    }

    const inputFile = req.file.path;
    const modifiedFile = inputFile + "_modified";

    try {
      const content = fs.readFileSync(inputFile, "utf8");

      let modifiedContent = "";
      for (let i = 0; i < content.length; i++) {
        modifiedContent += content[i];
        if ((i + 1) % spacing === 0 && i < content.length - 1) {
          modifiedContent += " ";
        }
      }

      fs.writeFileSync(modifiedFile, modifiedContent);

      const hdfsInputPath = "/wordcount/modified-input";
      const hdfsOutputPath = "/wordcount/modified-output";

      await executeCommand(
        `hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`
      ).catch(() => {});
      await executeCommand(`hdfs dfs -mkdir -p ${hdfsInputPath}`);
      await executeCommand(`hdfs dfs -put ${modifiedFile} ${hdfsInputPath}`);
      await executeCommand(
        `hadoop jar /opt/homebrew/Cellar/hadoop/3.4.0/libexec/share/hadoop/mapreduce/hadoop-mapreduce-examples-3.4.0.jar wordcount ${hdfsInputPath} ${hdfsOutputPath}`
      );

      const resultFile = "modified_result.txt";
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

      await executeCommand(
        `hdfs dfs -rm -r ${hdfsInputPath} ${hdfsOutputPath}`
      );
      fs.unlinkSync(resultFile);
      fs.unlinkSync(inputFile);
      fs.unlinkSync(modifiedFile);

      res.json({
        results,
        originalContent: content,
        modifiedContent: modifiedContent,
      });
    } catch (error) {
      console.error("Erreur:", error);

      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(modifiedFile)) fs.unlinkSync(modifiedFile);

      res.status(500).json({ error: "Erreur lors du traitement du fichier" });
    }
  }
);

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
})