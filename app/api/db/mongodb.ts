// import { MongoClient } from "mongodb"

// if (!process.env.MONGODB_URI) {
//   throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
// }

// const uri = process.env.MONGODB_URI  || "mongodb+srv://MERNDB:merndb7300@cluster0.ysqqg.mongodb.net/trading-book?retryWrites=true&w=majority"
// const options = {}

// let client
// let clientPromise: Promise<MongoClient>

// if (process.env.NODE_ENV === "development") {
//   // In development mode, use a global variable so that the value
//   // is preserved across module reloads caused by HMR (Hot Module Replacement).
//   const globalWithMongo = global as typeof globalThis & {
//     _mongoClientPromise?: Promise<MongoClient>
//   }

//   if (!globalWithMongo._mongoClientPromise) {
//     client = new MongoClient(uri, options)
//     globalWithMongo._mongoClientPromise = client.connect()
//   }
//   clientPromise = globalWithMongo._mongoClientPromise
// } else {
//   // In production mode, it's best to not use a global variable.
//   client = new MongoClient(uri, options)
//   clientPromise = client.connect()
// }

// // Export a module-scoped MongoClient promise. By doing this in a
// // separate module, the client can be shared across functions.
// export default clientPromise

// lib/mongodb.ts
// import mongoose from "mongoose"

// const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://MERNDB:merndb7300@cluster0.ysqqg.mongodb.net/trading-book?retryWrites=true&w=majority"
// console.log("MONGODB_URI:", MONGODB_URI)
// if (!MONGODB_URI) {
//   throw new Error("Please define the MONGODB_URI environment variable")
// }

// let isConnected = false // Track the connection status

// export async function connectDB() {
//   if (isConnected) {
//     return
//   }

//   try {
//     const db = await mongoose.connect(MONGODB_URI, {
//       dbName: "trading-book",
//     })
//     isConnected = true
//     console.log("✅ MongoDB connected")
//     return db
//   } catch (error) {
//     console.error("❌ MongoDB connection error:", error)
//     throw new Error("Could not connect to MongoDB")
//   }
// }


import mongoose from 'mongoose';

const MONGODB_URI =  'mongodb+srv://MERNDB:merndb7300@cluster0.ysqqg.mongodb.net/trading-book?retryWrites=true&w=majority';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
