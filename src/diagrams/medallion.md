```mermaid
flowchart LR
A[Ingest] --> B[Store] --> C[Transform]

%% Force connectors to right side for these nodes
classDef east layoutOptions:'{"elk.portConstraints":"FIXED_SIDE","elk.port.side":"EAST"}';
class A,B,C east;

%% Example domain styling
classDef ingest fill:#064e3b,stroke:#22c55e,stroke-width:2px,color:#fff;
classDef store  fill:#402a00,stroke:#f59e0b,stroke-width:2px,color:#fff;
classDef xform  fill:#2c1a4a,stroke:#a78bfa,stroke-width:2px,color:#fff;

class A ingest; class B store; class C xform;
```