interface RouteWarmupScriptProps {
  chunks: string[]
  nonce?: string
}

export function RouteWarmupScript({ chunks, nonce }: RouteWarmupScriptProps) {
  if (import.meta.env.DEV) {
    return null
  }
  if (chunks.length === 0) {
    return null
  }

  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: buildIdleWarmupScript(chunks) }} />
}

function buildIdleWarmupScript(chunks: string[]): string {
  return `(function(){var c=navigator.connection;if(c&&c.saveData)return;if(c&&c.effectiveType==="2g")return;var chunks=${JSON.stringify(chunks)};var i=0;var batch=5;var links=[];function run(){var end=Math.min(i+batch,chunks.length);for(;i<end;i++){var l=document.createElement("link");l.rel="modulepreload";l.href=chunks[i];document.head.appendChild(l);links.push(l)}if(i<chunks.length)sched();else setTimeout(function(){for(var j=0;j<links.length;j++)links[j].remove()},5000)}function sched(){if(typeof requestIdleCallback==="function")requestIdleCallback(run,{timeout:2000});else setTimeout(run,100)}if(document.visibilityState==="visible")setTimeout(run,2000);else document.addEventListener("visibilitychange",function h(){if(document.visibilityState==="visible"){document.removeEventListener("visibilitychange",h);setTimeout(run,1000)}})})()`
}
