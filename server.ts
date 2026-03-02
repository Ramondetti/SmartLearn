"use strict"

//A. import delle librerie
import http from "http" //importo l'export default dal modulo http, gli metto come nome http
import fs from "fs" //consente di usare il file system
import express, { NextFunction } from "express"
import dotenv from "dotenv"
import {MongoClient, ObjectId} from "mongodb"
import queryStringParser from "./queryStringParser"
import cors from "cors"
import vision from '@google-cloud/vision'

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

//5. log dei parametri post
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

//6. vincoli CORS
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
