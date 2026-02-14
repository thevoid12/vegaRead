import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  // const [name, setName] = useState("");

  // async function greet() {
  //   setGreetMsg(await invoke("greet", { name }));
  // }
async function show_home_page(){
  setGreetMsg(await invoke("show_home_page_handler"));
}

  useEffect(() => {
    show_home_page();
  }, []);
  return (
    <main className="container">
      <h1>Welcome to void world</h1>

      {/* <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div> */}
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
