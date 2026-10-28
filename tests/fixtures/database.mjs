import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
export function database(){
 const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../../drizzle',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../../drizzle/'+f,import.meta.url),'utf8'));
 const db={
  prepare(sql){return {bind(...values){
   const statement=sqlite.prepare(sql);
   return {first:async()=>statement.get(...values)||null,all:async()=>({results:statement.all(...values)}),run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})};
  }}},
  async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}
 };
 // D1 also permits unbound queries, used for profile lookup.
 const prepared=db.prepare.bind(db);db.prepare=sql=>{const q=prepared(sql),bound=q.bind();return {...bound,bind:q.bind}};
 return {db,sqlite};
}
