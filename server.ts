"use strict"

//A. import delle librerie
import http from "http" //importo l'export default dal modulo http, gli metto come nome http
import fs from "fs" //consente di usare il file system
import express, { NextFunction } from "express"
import dotenv from "dotenv"
import {MongoClient} from "mongodb"
import queryStringParser from "./queryStringParser"
import cors from "cors"
import multer from 'multer'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { GoogleGenAI } from "@google/genai";

//grazie a @type di express, visual studio riconosce implicitamente i tipi e li associa
//automaticamente
//è tipizzato implicitamente
//questo da errore:
//let porta = 3000
//porta = "3000"

//B. configurazioni
const app = express()
//và leggere le configurazioni scritte dentro al file .env
dotenv.config({path:".env"})
const connectionString = process.env.connectionStringLocal
const dbName = process.env.dbName
const genAI = new GoogleGenAI({apiKey: process.env.GenAI_KEY!});

//C. creazione ed avvio del server http
const server = http.createServer(app)
let paginaErrore:string = ""

//avviamo il server sulla porta indicata
server.listen(process.env.port,function(){
    console.log("Server in ascolto sulla porta: " + process.env.port)
    fs.readFile("./static/error.html", function(err,content){
        if(err){
            paginaErrore = "<h1>Risorsa non trovata</h1>"
        }
        else{
            //content: sequenza di byte
            paginaErrore = content.toString()
        }
    })
})

//D. middleware
//1. request log
app.use("/",function(req,res,next){
    //req.originalUrl: path completo della richiesta
    console.log(req.method + ": " + req.originalUrl)
    next()
})

//2. gestione risorse statiche
app.use("/",express.static("./static"))

//3. lettura parametri POST
//accetto parametri post con una dimensione massima di 5MB
//restituisce i parametri come json all'interno di req.body
//i parametri GET sono restituiti come json in req.query
//(agganciati automaticamente perchè in coda alla url)
app.use("/",express.json({"limit":"5mb"}))

//4. parsing dei parametri get
app.use("/",queryStringParser)

const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configurazione storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Genera nome unico: timestamp-nomefile
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

// Configurazione upload
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accetta solo PDF e immagini
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Solo PDF, JPG, PNG.'));
    }
  }
});

//6. log dei parametri post
//i parametri get si vedono con il log della richiesta
app.use("/",function(req,res,next){
    //object.keys restituisce un vettore di chiavi del json req.body
    if(req["query"] && Object.keys(req["query"]).length > 0)
        console.log("      " + JSON.stringify(req["query"]))
    if(req.body && Object.keys(req.body).length > 0){
        console.log("     Parametri body: " + JSON.stringify(req.body))
    }
    next()
})

//7. vincoli CORS
//accettiamo richieste da qualunque client
//DA RIGUARDARE CORS
const corsOptions = {
 origin: function(origin:any, callback:any) {
 return callback(null, true);
 },
 credentials: true
};
app.use("/", cors(corsOptions));

//E. gestione delle risorse dinamiche
app.post("/api/upload", upload.single("file"), async function(req, res) {
    // ── Setup SSE ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Helper per mandare eventi al client
    const sendEvent = (step: number, pct: number, msg: string) => {
        res.write(`data: ${JSON.stringify({ step, pct, msg })}\n\n`);
    };

    try {
        const filePath: any = req.file?.path;
        const mimeType = req.file?.mimetype;

        if (mimeType !== "application/pdf") {
            fs.unlinkSync(filePath);
            res.write(`data: ${JSON.stringify({ error: "Solo PDF supportati" })}\n\n`);
            return res.end();
        }

        // ── Step 1: Lettura PDF ──
        sendEvent(1, 10, "Lettura del file PDF...");
        const dataBuffer = await fs.promises.readFile(filePath);
        const uint8Array = new Uint8Array(dataBuffer);
        const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;

        // ── Step 2: Estrazione testo ──
        sendEvent(1, 20, "Estrazione testo in corso...");
        let extractedTextFromPdf = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            extractedTextFromPdf += content.items.map((item: any) => item.str).join(" ") + "\n";

            // Aggiorna il progresso pagina per pagina
            const pct = 20 + Math.round((i / pdf.numPages) * 15);
            sendEvent(1, pct, `Analisi pagina ${i} di ${pdf.numPages}...`);
        }
        extractedTextFromPdf = extractedTextFromPdf.replace(/\s+/g, " ").trim();
        sendEvent(1, 35, "Testo estratto con successo ✓");

        // ── Step 3: Generazione Flashcard ──
        const MAX_CHARS = 70000;
        const chunksCount = Math.ceil(extractedTextFromPdf.length / MAX_CHARS);
        let rispostaFlashcard = "";

        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            const chunkIndex = Math.floor(i / MAX_CHARS) + 1;
            const pct = 35 + Math.round((chunkIndex / chunksCount) * 30);
            sendEvent(2, pct, `Generazione flashcard (parte ${chunkIndex}/${chunksCount})...`);

            const extractedText = extractedTextFromPdf.substring(i, i + MAX_CHARS);
            const promptFlashcard = `Genera quante più flashcard che abbiano senso di livello avanzato dal testo seguente.
            Rispondi SOLO con un array JSON VALIDO senza altre scritte solo l'array senza backtick e apici.
            se il testo è povero di contenuto restituisci un []
            Formato: [{ "front": "...", "back": "..." }]
            TESTO: "${extractedText}"`;

            const responseFlashCard = await genAI.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: promptFlashcard
            });
            rispostaFlashcard += responseFlashCard.text;
        }
        sendEvent(2, 65, "Flashcard generate con successo ✓");
        console.log("FLASHCARD GENERATE")

        // ── Step 4: Generazione Quiz ──
        let rispostaQuiz = "";

        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            const chunkIndex = Math.floor(i / MAX_CHARS) + 1;
            const pct = 65 + Math.round((chunkIndex / chunksCount) * 30);
            sendEvent(3, pct, `Generazione quiz (parte ${chunkIndex}/${chunksCount})...`);

            const extractedText = extractedTextFromPdf.substring(i, i + MAX_CHARS);
            const promptQuiz = `Genera quiz a risposta multipla basati su questo testo.
            REGOLE CRITICHE:
            1. Rispondi SOLO con un array JSON
            2. NO testo prima o dopo l'array
            3. NO markdown (no backtick)
            4. NO spiegazioni
            5. Array vuoto [] se testo insufficiente

            FORMATO ESATTO:
            [{"question":"Domanda?","options":["A","B","C","D"],"correct":0}]

            VINCOLI:
            - "correct" deve essere 0, 1, 2, o 3 (indice dell'opzione corretta)
            - Tutte le stringhe tra virgolette doppie
            - NO apici singoli
            - NO spazi extra
            - NO newline dentro le stringhe

            TESTO DA ANALIZZARE: "${extractedText}"`;

            const responseQuiz = await genAI.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: promptQuiz
            });
            rispostaQuiz += responseQuiz.text;
        }
        sendEvent(3, 95, "Quiz generati con successo ✓");
        console.log("QUIZ GENERATI")

        // ── Step finale: manda i dati ──
        sendEvent(4, 100, "Tutto pronto! 🚀");
        res.write(`data: ${JSON.stringify({
            done: true,
            flashcard: rispostaFlashcard,
            quiz: rispostaQuiz
        })}\n\n`);
        res.end();

        // Pulisci il file uploadato
        fs.unlinkSync(filePath);

    } catch (error: any) {
        console.error("Errore server:", error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

app.get("/api/:collection",async function(req:any,res,next) {
    const selectedCollection = req.params.collection
    const filters = req["parsedQuery"]
    const client = new MongoClient(connectionString!)
    await client.connect().catch(function(err){
        res.status(503).send("Errore di connessione al dbms")
        return
    })
    const db = client.db(dbName)
    const collection = client.db(dbName).collection(selectedCollection)
    const cmd = collection.find(filters).toArray()

    cmd.then(function(data){
        res.send(data)
    })

    cmd.catch(function(err){
        res.status(500).send("Errore esecuzione query: " + err)
    })

    cmd.finally(function(){
        client.close()
    })
})

//F. default route
//se non trova nessuna route che va a buon finire,
//la defautl route darà errore 404
app.use("/",function(req,res,next){
    //res.status() di default è 200
    res.status(404)
    if(!req.originalUrl.startsWith("/api/")){
        //send serializza in automatico solo se gli passo un json
        res.send(paginaErrore)
    }
    else{
        res.send("Risorsa non trovata")
    }
})

//G. route gestione errori
//se si verifica un errore express salta a questa
//route. la route di errore ha un parametro in più, così
//capisce quale è
app.use("/",function(err:Error,req:express.Request,res:express.Response,next:NextFunction){
    console.log("*****ERRORE*****\n" + err.stack) //err.stack da lo stack completo degli errori
    //se vado in errore il client rimane in attesa
    res.status(500).send(err.message) //err.message messaggio riassuntivo errore
    //se non gestisco gli errori il server fa il log dello stack degli errori
    //e poi si ferma
})
