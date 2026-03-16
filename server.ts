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
//USARE FORSE OLLAMA, RISOLVERE PROBLEMA
// ============================================
// HELPER: Parse JSON robusto
// ============================================

function extractJSON(text: string): any[] {
    console.log('🔍 Extracting JSON from AI response...');
    
    // Rimuovi markdown
    text = text.replace(/```json/gi, '').replace(/```/g, '');
    
    // Trova primo [ e ultimo ]
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    
    if (start === -1 || end === -1 || start > end) {
        console.warn('⚠️ No valid JSON array found');
        return [];
    }
    
    const jsonStr = text.substring(start, end + 1)
        .replace(/\n/g, ' ')
        .replace(/\r/g, '')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
        console.error('❌ JSON parse error:', error.message);
        
        // Tentativo riparazione
        try {
            const repaired = jsonStr
                .replace(/'/g, '"')
                .replace(/,\s*([}\]])/g, '$1');
            
            const parsed = JSON.parse(repaired);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
}

// ============================================
// UPLOAD ENDPOINT - VERSIONE ROBUSTA E VELOCE
// ============================================

app.post("/api/upload", upload.single("file"), async function(req, res) {
    // ── Setup SSE ──
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

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

            const pct = 20 + Math.round((i / pdf.numPages) * 15);
            sendEvent(1, pct, `Analisi pagina ${i} di ${pdf.numPages}...`);
        }
        extractedTextFromPdf = extractedTextFromPdf.replace(/\s+/g, " ").trim();
        sendEvent(1, 35, "Testo estratto con successo ✓");

        console.log('📄 Extracted text length:', extractedTextFromPdf.length);

        // ── Step 3 & 4: Generazione PARALLELA (più veloce!) ──
        const MAX_CHARS = 70000;
        const chunks: string[] = [];
        
        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            chunks.push(extractedTextFromPdf.substring(i, i + MAX_CHARS));
        }

        console.log('📚 Processing', chunks.length, 'chunks in parallel...');
        
        sendEvent(2, 40, "Generazione flashcard e quiz...");

        // ✅ GENERA FLASHCARD E QUIZ IN PARALLELO
        const flashcardPromises = chunks.map(async (chunk, index) => {
            const promptFlashcard = `Genera flashcard di livello avanzato dal testo seguente.
            Rispondi SOLO con un array JSON senza altre scritte, senza backtick, senza markdown.
            Se il testo è povero restituisci []
            Formato: [{"front":"Domanda?","back":"Risposta"}]
            TESTO: "${chunk}"`;

            try {
                const response = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: promptFlashcard
                });

                const flashcards = extractJSON(response.text!);
                
                // Filtra flashcard valide
                const valid = flashcards.filter(f =>
                    f?.front && f?.back &&
                    typeof f.front === 'string' &&
                    typeof f.back === 'string' &&
                    f.front.trim() && f.back.trim()
                );

                console.log(`✅ Flashcard chunk ${index + 1}: ${valid.length} valid`);
                return valid;

            } catch (error: any) {
                console.error(`❌ Flashcard chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        const quizPromises = chunks.map(async (chunk, index) => {
            const promptQuiz = `Genera quiz a risposta multipla dal testo seguente.
            Rispondi SOLO con un array JSON senza altre scritte, senza backtick, senza markdown.
            Se il testo è povero restituisci []
            Formato: [{"question":"Domanda?","options":["A","B","C","D"],"correct":0}]
            VINCOLI:
            - correct deve essere 0, 1, 2 o 3
            - Esattamente 4 opzioni
            TESTO: "${chunk}"`;

            try {
                const response = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: promptQuiz
                });

                const quizzes = extractJSON(response.text!);
                
                // Filtra quiz validi
                const valid = quizzes.filter(q =>
                    q?.question &&
                    Array.isArray(q.options) &&
                    q.options.length === 4 &&
                    typeof q.correct === 'number' &&
                    q.correct >= 0 &&
                    q.correct <= 3 &&
                    q.options.every((opt: any) => typeof opt === 'string' && opt.trim())
                );

                console.log(`✅ Quiz chunk ${index + 1}: ${valid.length} valid`);
                return valid;

            } catch (error: any) {
                console.error(`❌ Quiz chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        // ✅ ATTENDI TUTTO IN PARALLELO
        sendEvent(2, 50, "Elaborazione in corso...");
        
        const [flashcardResults, quizResults] = await Promise.all([
            Promise.all(flashcardPromises),
            Promise.all(quizPromises)
        ]);

        // Flatten arrays
        const allFlashcards = flashcardResults.flat();
        const allQuizzes = quizResults.flat();

        sendEvent(2, 90, `Flashcard: ${allFlashcards.length} ✓`);
        sendEvent(3, 95, `Quiz: ${allQuizzes.length} ✓`);

        console.log('✅ Total flashcards:', allFlashcards.length);
        console.log('✅ Total quizzes:', allQuizzes.length);

        // ── Step finale ──
        sendEvent(4, 100, "Tutto pronto! 🚀");
        
        res.write(`data: ${JSON.stringify({
            done: true,
            flashcard: JSON.stringify(allFlashcards),
            quiz: JSON.stringify(allQuizzes),
            extractedText: extractedTextFromPdf
        })}\n\n`);
        
        res.end();

        fs.unlinkSync(filePath);

        console.log('✅ Upload completed successfully');

    } catch (error: any) {
        console.error("❌ Errore server:", error);
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
