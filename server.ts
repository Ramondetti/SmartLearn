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
import Tesseract, { createWorker } from 'tesseract.js';
import sharp from 'sharp';

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
// ============================================
// HELPER: Extract JSON
// ============================================

function extractJSON(text: string): any[] {
    console.log('🔍 Extracting JSON...');
    
    text = text.replace(/```json/gi, '').replace(/```/g, '');
    
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    
    if (start === -1 || end === -1 || start > end) {
        console.warn('⚠️ No JSON array found');
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
        console.error('❌ Parse error:', error.message);
        
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
// OCR CON TESSERACT
// ============================================

async function extractTextWithOCR(filePath: string): Promise<string> {
    let worker: Tesseract.Worker | null = null;
    let processedPath = filePath;
    
    try {
        console.log('🔍 Starting OCR with Tesseract for:', filePath);
        
        // ✅ Usa setTimeout per dare tempo a Sharp di chiudere il file
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Crea worker
        worker = await createWorker('ita', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        
        // Esegui OCR
        const { data: { text } } = await worker.recognize(processedPath);
        
        // ✅ CLEANUP WORKER PRIMA
        await worker.terminate();
        worker = null;
        
        // ✅ Aspetta prima di eliminare file
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Elimina file processato
        if (processedPath !== filePath) {
            try {
                await fs.promises.unlink(processedPath);
                console.log('✅ Deleted processed image');
            } catch (err: any) {
                console.warn('⚠️ Could not delete processed image:', err.message);
            }
        }
        
        // Pulizia testo
        const cleanedText = text
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[^\x00-\x7F\u00C0-\u00FF\n\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        console.log('✅ OCR completed:', cleanedText.length, 'chars');
        
        // ✅ Debug: mostra testo estratto
        console.log('📝 OCR Text Preview:', cleanedText.substring(0, 200));
        
        return cleanedText;
        
    } catch (error: any) {
        console.error('❌ OCR error:', error);
        
        // Cleanup worker
        if (worker) {
            try {
                await worker.terminate();
            } catch {}
        }
        
        // Cleanup file processato
        if (processedPath !== filePath) {
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                await fs.promises.unlink(processedPath);
            } catch {}
        }
        
        throw new Error('OCR fallito: ' + error.message);
    }
}

// ============================================
// UNIVERSAL TEXT EXTRACTION
// ============================================

async function extractText(filePath: string, mimeType: string): Promise<string> {
    console.log('📄 Extracting text from:', mimeType);
    
    // PDF Nativo
    if (mimeType === 'application/pdf') {
        try {
            const dataBuffer = await fs.promises.readFile(filePath);
            const uint8Array = new Uint8Array(dataBuffer);
            const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map((item: any) => item.str).join(' ') + '\n';
            }
            
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text.length < 100) {
                console.warn('⚠️ PDF appears to be scanned, using OCR...');
                return await extractTextWithOCR(filePath);
            }
            
            return text;
            
        } catch (error) {
            console.error('❌ PDF extraction failed:', error);
            throw error;
        }
    }
    
    // Immagini - Usa OCR
    if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/jpg') {
        return await extractTextWithOCR(filePath);
    }
    
    throw new Error('Tipo file non supportato: ' + mimeType);
}

// ============================================
// UPLOAD ENDPOINT OCR DA IMPLEMENTARE
// ============================================

app.post("/api/upload", upload.single("file"), async function(req, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (step: number, pct: number, msg: string) => {
        res.write(`data: ${JSON.stringify({ step, pct, msg })}\n\n`);
    };

    // ✅ Variabile per tracciare se la risposta è chiusa
    let responseEnded = false;
    
    // ✅ Helper per terminare risposta in modo sicuro
    const safeEnd = () => {
        if (!responseEnded) {
            res.end();
            responseEnded = true;
        }
    };
    
    const safeWrite = (data: string) => {
        if (!responseEnded) {
            res.write(data);
        }
    };

    try {
        const filePath: any = req.file?.path;
        const mimeType = req.file?.mimetype;

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(mimeType!)) {
            // ✅ Aspetta prima di eliminare
            await new Promise(resolve => setTimeout(resolve, 500));
            await fs.promises.unlink(filePath);
            
            safeWrite(`data: ${JSON.stringify({ error: "Tipo file non supportato. Usa PDF, JPG o PNG" })}\n\n`);
            return safeEnd();
        }

        sendEvent(1, 10, "Lettura del file...");

        // Estrazione testo
        let extractedTextFromPdf: string;
        
        try {
            if (mimeType!.startsWith('image/')) {
                sendEvent(1, 15, "🔍 Riconoscimento testo con OCR...");
            } else {
                sendEvent(1, 15, "Estrazione testo in corso...");
            }
            
            extractedTextFromPdf = await extractText(filePath, mimeType!);
            
            if (!extractedTextFromPdf || extractedTextFromPdf.length < 50) {
                throw new Error('Testo estratto insufficiente. Assicurati che il documento contenga testo leggibile.');
            }
            
            sendEvent(1, 35, "Testo estratto con successo ✓");
            console.log('✅ Extracted text:', extractedTextFromPdf.length, 'chars');
            
        } catch (extractError: any) {
            console.error('❌ Text extraction failed:', extractError);
            
            // ✅ Cleanup con delay
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                await fs.promises.unlink(filePath);
            } catch {}
            
            safeWrite(`data: ${JSON.stringify({ 
                error: extractError.message || 'Estrazione testo fallita'
            })}\n\n`);
            return safeEnd();
        }

        // Generazione AI
        const MAX_CHARS = 70000;
        const chunks: string[] = [];
        
        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            chunks.push(extractedTextFromPdf.substring(i, i + MAX_CHARS));
        }

        console.log('📚 Processing', chunks.length, 'chunks in parallel...');
        sendEvent(2, 40, "Generazione flashcard e quiz...");

        // ✅ PROMPT MIGLIORATI - Gestiscono meglio testo OCR
        const flashcardPromises = chunks.map(async (chunk, index) => {
            const promptFlashcard = `Sei un assistente educativo. Analizza il seguente testo e genera flashcard di studio.
            TESTO DA ANALIZZARE:
            """
            ${chunk}
            """

            ISTRUZIONI:
            - Crea flashcard chiare e concise
            - Ogni domanda deve essere comprensibile
            - Le risposte devono essere accurate
            - Se il testo è poco chiaro o troppo breve, genera almeno 2-3 flashcard basandoti sui concetti principali

            FORMATO OUTPUT:
            Rispondi SOLO con un array JSON valido, senza markdown, senza backtick.
            Formato: [{"front":"Domanda?","back":"Risposta"}]

            ESEMPIO:
            [{"front":"Cos'è il pane?","back":"Un alimento a base di farina, acqua, lievito e sale"}]`;

            try {
                const response = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: promptFlashcard
                });

                const flashcards = extractJSON(response.text!);
                
                const valid = flashcards.filter(f =>
                    f?.front && f?.back &&
                    typeof f.front === 'string' &&
                    typeof f.back === 'string' &&
                    f.front.trim().length > 5 &&
                    f.back.trim().length > 5
                );

                console.log(`✅ Flashcard chunk ${index + 1}: ${valid.length} valid`);
                return valid;

            } catch (error: any) {
                console.error(`❌ Flashcard chunk ${index + 1}:`, error.message);
                return [];
            }
        });

        const quizPromises = chunks.map(async (chunk, index) => {
            const promptQuiz = `Sei un assistente educativo. Analizza il seguente testo e genera quiz a risposta multipla.
            TESTO DA ANALIZZARE:
            """
            ${chunk}
            """

            ISTRUZIONI:
            - Crea domande chiare basate sul testo
            - 4 opzioni di risposta per ogni domanda
            - Una sola risposta corretta
            - Se il testo è poco chiaro, genera comunque 2-3 domande sui concetti principali

            FORMATO OUTPUT:
            Rispondi SOLO con un array JSON valido, senza markdown, senza backtick.
            Formato: [{"question":"Domanda?","options":["A","B","C","D"],"correct":0}]
            - correct deve essere 0, 1, 2 o 3 (indice della risposta corretta)

            ESEMPIO:
            [{"question":"Qual è l'ingrediente principale del pane?","options":["Farina","Zucchero","Burro","Olio"],"correct":0}]`;

            try {
                const response = await genAI.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: promptQuiz
                });

                const quizzes = extractJSON(response.text!);
                
                const valid = quizzes.filter(q =>
                    q?.question &&
                    Array.isArray(q.options) &&
                    q.options.length === 4 &&
                    typeof q.correct === 'number' &&
                    q.correct >= 0 &&
                    q.correct <= 3 &&
                    q.options.every((opt: any) => typeof opt === 'string' && opt.trim().length > 0)
                );

                console.log(`✅ Quiz chunk ${index + 1}: ${valid.length} valid`);
                return valid;

            } catch (error: any) {
                console.error(`❌ Quiz chunk ${index + 1}:`, error.message);
                return [];
            }
        });

        sendEvent(2, 50, "Elaborazione in corso...");
        
        const [flashcardResults, quizResults] = await Promise.all([
            Promise.all(flashcardPromises),
            Promise.all(quizPromises)
        ]);

        const allFlashcards = flashcardResults.flat();
        const allQuizzes = quizResults.flat();

        sendEvent(2, 90, `Flashcard: ${allFlashcards.length} ✓`);
        sendEvent(3, 95, `Quiz: ${allQuizzes.length} ✓`);

        console.log('✅ Total flashcards:', allFlashcards.length);
        console.log('✅ Total quizzes:', allQuizzes.length);

        sendEvent(4, 100, "Tutto pronto! 🚀");
        
        safeWrite(`data: ${JSON.stringify({
            done: true,
            flashcard: JSON.stringify(allFlashcards),
            quiz: JSON.stringify(allQuizzes),
            extractedText: extractedTextFromPdf
        })}\n\n`);
        
        safeEnd();

        // ✅ CLEANUP FILE ORIGINALE CON DELAY
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            await fs.promises.unlink(filePath);
            console.log('✅ Deleted original file');
        } catch (err: any) {
            console.warn('⚠️ Could not delete original file:', err.message);
        }

        console.log('✅ Upload completed successfully');

    } catch (error: any) {
        console.error("❌ Errore server:", error);
        
        if (!responseEnded) {
            safeWrite(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            safeEnd();
        }
        
        // Cleanup file in caso di errore
        if (req.file?.path) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                await fs.promises.unlink(req.file.path);
            } catch {}
        }
    }
});
app.post("/api/chat", upload.single("file"), async function(req, res) {
    const prompt = req.body.prompt
    const testo = req.body.testoDocumento

    console.log('💬 Chat request');
        console.log('   Message:', prompt?.substring(0, 100));
        console.log('   Context size:', testo?.length || 0);
        
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: "Message is required" 
            });
        }
        
        // ✅ COSTRUISCI PROMPT CON RAG
        let fullPrompt;
        
        if (testo && testo.length > 0) {
            // L'utente ha caricato un documento - USA RAG
            fullPrompt = `Sei un tutor AI esperto che aiuta studenti a studiare.
            HAI ACCESSO AL SEGUENTE DOCUMENTO CARICATO DALLO STUDENTE:

            ===== DOCUMENTO =====
            ${testo}
            ===== FINE DOCUMENTO =====

            ISTRUZIONI:
            1. Rispondi SOLO basandoti sul contenuto di questo documento
            2. Se la domanda non riguarda il documento, rispondi gentilmente che puoi aiutare solo con il materiale fornito
            3. Sii chiaro, conciso ed educativo
            4. Usa esempi dal documento quando possibile
            5. Se citi qualcosa, riferisciti esplicitamente al documento

            DOMANDA DELLO STUDENTE:
            ${prompt}

            RISPOSTA (basata sul documento):`;
        } else {
            // Nessun documento - invita a caricarlo
            fullPrompt = `Sei un tutor AI che aiuta gli studenti.
            IMPORTANTE: Lo studente non ha ancora caricato nessun documento. Invitalo gentilmente a caricare un PDF per ricevere assistenza personalizzata sul materiale di studio.
            DOMANDA:
            ${prompt}
            RISPOSTA:`;
        }
        console.log('🤖 Calling Gemini...');
        
        // ✅ CHIAMATA A GEMINI 2.5 FLASH
        const response = await genAI.models.generateContent({ 
            model: "gemini-2.5-flash",
            contents:fullPrompt
        });
        
        console.log('✅ Response generated:', response.text!, 'chars');
        
        res.send({response: response.text});
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
