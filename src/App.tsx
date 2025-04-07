import { useMemo } from "react";
import Component from "./components/yourComponent";
import "./App.css";
import { client, useConfig, useElementData } from "@sigmacomputing/plugin";

client.config.configureEditorPanel([
  { name: "yourSource", type: "element" },
  { name: "col1", type: "column", source: "yourSource", allowMultiple: false },
  { name: "col2", type: "column", source: "yourSource", allowMultiple: false },
]);

function App() {
  const config = useConfig();
  const yourSourceData = useElementData(config.bol);

  return (
    <Component
    />
  );
}

export default App;