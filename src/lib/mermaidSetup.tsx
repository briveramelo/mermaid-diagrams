import mermaid from "mermaid";
import elk from "@mermaid-js/layout-elk";

mermaid.registerLayoutLoaders(elk);
mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "dark",
    themeVariables: {
        lineColor: "#9CA3AF",
        textColor: "#E5E7EB",
        fontSize: "14px",
    },
    flowchart: {
        defaultRenderer: "elk",
        curve: "basis",
        nodeSpacing: 24,
        rankSpacing: 64,
        htmlLabels: true,
    },
    elk: {
        mergeEdges: false,
        nodePlacementStrategy: "LINEAR_SEGMENTS",
        cycleBreakingStrategy: "GREEDY_MODEL_ORDER",
    },
});

export default mermaid;