// Keep the local business UI's projections and opted-in public displays current.
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
loadEnvFile(resolve(root,"api/.env"));
let stopping=false,child;
process.on("SIGTERM",()=>{stopping=true;child?.kill("SIGTERM");});
process.on("SIGINT",()=>{stopping=true;child?.kill("SIGTERM");});
function run(folder,file){return new Promise(resolveResult=>{
 child=spawn(process.execPath,[file],{cwd:resolve(root,folder),env:process.env,stdio:"ignore"});
 child.once("error",()=>resolveResult(false));child.once("exit",code=>resolveResult(code===0));
});}
while(!stopping){
 let ok=true;
 for(const [folder,file] of [["indexer","dist/backfill.js"],["indexer","dist/project.js"],["api","dist/sync-business-publications.js"]]){
  if(stopping||!await run(folder,file)){ok=false;break;}
 }
 if(!ok&&!stopping)console.error("TraceForge projection cycle failed; retrying shortly.");
 if(!stopping)await new Promise(done=>setTimeout(done,5000));
}
