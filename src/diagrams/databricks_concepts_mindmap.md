```mermaid
---
config:
  theme: dark
  mindmap:
    useMaxWidth: true
    branchSpacing: 40
    leafSpacing: 20
    padding: 16
  themeVariables:
    lineColor: "#9CA3AF"
    textColor: "#E5E7EB"
    fontSize: 16px
---

mindmap
  root((Databricks Data Intelligence Platform))
    📜 Governance
      Unity Catalog
        Access Control
        Row Filters
        Column Masks
        Data Lineage
        Catalog Explorer
        Three-Level Namespace
        ABAC Policies
    📥 Ingestion
      Lakeflow Connect
        Managed Connectors
          Salesforce Connector
          SQL Server Connector
          ServiceNow Connector
          Google Analytics 4 Connector
        Standard Connectors
          JDBC Connector
          Kafka Connector
          Amazon Kinesis Connector
          Azure Event Hubs Connector
          Google Cloud Pub/Sub Connector
        File Ingestion
          Auto Loader
          COPY INTO Command
          UI Upload
      Change Data Capture
        Lakeflow Declarative Pipelines
    💾 Storage
      Delta Lake
        Parquet Format
        Delta Log
      Tables
      Views
      Streaming Tables
      Materialized Views
      Volumes
    🛠 DevOps
      Databricks Workspace
      Notebooks
        Python
        SQL
        Scala
        R
      Repos
      Databricks Connect
        VS Code
        PyCharm
      APIs
        REST APIs
        SDKs
        CLI
      Asset Bundles
    🔄 Transformation
      Lakeflow Declarative Pipelines
      Spark SQL
      Structured Streaming
      Expectations
    ⏱ Orchestration
      Lakeflow Jobs
        Job Triggers
          Scheduled Trigger
          File Arrival Trigger
          Continuous Trigger
        Job Parameters
        Job Notifications
        System Tables
    🔍 Querying
      Databricks SQL
      SQL Warehouses
        Serverless Warehouse
        Pro Warehouse
        Classic Warehouse
      Photon Engine
    🧠 ML & AI
      MLflow
        Experiment Tracking
        Model Registry
        Feature Store
          Online Tables
      Mosaic AI
        Agent Framework
        Vector Search
        Model Evaluation
        Model Guardrails
        AI Functions
        Model Serving
        AI Gateway
        Lakehouse IQ
    📊 Visualization
      AI/BI Dashboards
      Partner BI Tools
      Genie - AI Assistant
    🤝 Sharing
      Delta Sharing
      Clean Rooms
      Databricks Marketplace
    🔒 Security & Observability
      Audit Logs
      Network Policies
      Private Connectivity
      Encryption
      IP Access Lists
```
