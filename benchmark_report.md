# Auvon.AI RAG Benchmarking Report

This report presents the results of an automated benchmark run on the Auvon.ai Retrieval-Augmented Generation (RAG) system using 5 complex study note topics, generating 5 dynamically generated questions per topic (25 total runs), and running the LLM-as-judge evaluator.

---

## 📊 Benchmark Summary

| Metric | Score |
| :--- | :--- |
| **Total Q&A Runs Executed** | 20 / 25 (5 runs skipped due to transient connection timeouts) |
| **Total Evaluated Q&A** | 19 runs (1 run skipped evaluation due to a prompt truncation error) |
| **Average Faithfulness** | **81.05%** (Target: ≥80.0%) |
| **Average Relevance** | **99.47%** (Target: ≥90.0%) |

---

## 📝 Detailed Logs & Scores

### Topic 1: Quantum Computing
- **Note length**: 23,462 characters
- **Q&A Q1**: *"What mathematical constraint must the complex probability amplitudes of a single qubit satisfy?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer accurately states the normalization constraint and its physical meaning, fully grounding all claims in the provided context and directly answering the question.
- **Q&A Q2**: *"Which quantum algorithm is used in cryptanalysis to break asymmetric cryptography like RSA and ECC?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer is completely faithful to the provided context, accurately identifying Shor's Algorithm and summarizing its complexity and applications exactly as described.
- **Q&A Q3**: *"Which quantum state is mapped to the North Pole (theta = 0) of the Bloch Sphere?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly and accurately identifies the quantum state mapped to the North Pole as |0> (or |+z>), fully supported by the provided text.

### Topic 2: Blockchains
- **Note length**: 20,056 characters
- **Q&A Q1**: *"What are the three security properties that a cryptographic hash function must satisfy for blockchain usage?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer perfectly and accurately states the three security properties of cryptographic hash functions as detailed in the context.
- **Q&A Q2**: *"What is the space and time complexity for cryptographic proofs using a Merkle Tree?"*
  - **Faithfulness**: 0.5 (50%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer correctly identifies the O(log N) complexity, but includes external details about light clients and mobile phones that are not present in the provided context.
- **Q&A Q3**: *"Which specific problem does Byzantine Fault Tolerance (BFT) solve?"*
  - **Faithfulness**: 0.5 (50%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly answers the question, but the 'Additional Context' section contains several facts about PBFT (such as negligible energy footprint, immediate finality, and 1/3 collusion vulnerability) that are not present in the provided context.
- **Q&A Q4**: *"In a Proof of Work system, what condition must the block header hash meet in relation to the target value T?"*
  - **Faithfulness**: 0.0 (0%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer relies entirely on external knowledge about target difficulty (e.g., 'less than or equal to T', '256-bit integer') which is not mentioned in the provided text.
- **Q&A Q5**: *"What is the term used for the initial block (Block 0) in a blockchain?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer accurately identifies 'genesis block' as the term for Block 0, fully supported by the provided sources.

### Topic 3: Photosynthesis
- **Note length**: 22,045 characters
- **Q&A Q1**: *"What is the main subject of Photosynthesis?"*
  - **Faithfulness**: 0.9 (90%)
  - **Relevance**: 0.9 (90%)
  - **Judge Feedback**: The answer is highly faithful and relevant, though it introduces minor external details (like Photosystem II and thylakoid lumen definition).
- **Q&A Q2**: *"What are the core concepts of Photosynthesis?"*
  - **Faithfulness**: 0.5 (50%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly addresses the core concepts of photosynthesis, but includes external information such as chemical equations and RuBisCO activity not found in the provided context.
- **Q&A Q3**: *"Can you explain the key terms in Photosynthesis?"*
  - **Faithfulness**: 0.5 (50%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer provides highly relevant explanations of key terms, but includes external information not found in the context, such as the Gibbs Free Energy change of photosynthesis.
- **Q&A Q4**: *"What is a practical application of Photosynthesis?"*
  - **Faithfulness**: 0.5 (50%) - **FAILED**
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly addresses the question using the context, but includes a hallucinated bullet point on biological energy conversion and Gibbs free energy that is not in the source text.
- **Q&A Q5**: *"What are the limitations of Photosynthesis?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly and comprehensively addresses the limitations of photosynthesis using only information from the provided text.

### Topic 4: World War II
- **Note length**: 15,416 characters
- **Q&A Q1**: *"Which two nations emerged as global superpowers after World War II, initiating the Cold War?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly and accurately identifies the United States and the Soviet Union, fully supported by the provided text.
- **Q&A Q2**: *"What was the name of the agreement signed on September 30, 1938, that permitted Germany's annexation of the Sudetenland?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly and accurately names the Munich Agreement.
- **Q&A Q3**: *"Which heavily fortified line did the German military bypass during the invasion of France in May 1940?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer accurately identifies the Maginot Line.
- **Q&A Q4**: *"What was the name of the June 1941 directive that ordered the immediate execution of captured Soviet political commissars?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer accurately names the Commissar Order.
- **Q&A Q5**: *"According to the text, how many rotor selection combinations are possible for a standard 3-rotor Enigma machine using a pool of 5 options?"*
  - **Faithfulness**: 1.0 (100%)
  - **Relevance**: 1.0 (100%)
  - **Judge Feedback**: The answer directly and accurately answers the question using the exact formula and calculation provided in the context.

---

## 💡 Key Insights & Analysis

1. **Why Faithfulness Scores Dropped on Certain Questions**:
   - The LLM (`gemini-3.5-flash`) is highly knowledgeable about core STEM topics (like Merkle Trees, BFT consensus, and Photosynthesis reactions).
   - In some cases, the LLM supplemented the retrieved context with its own pre-trained facts (such as referencing PBFT characteristics, Gibbs Free Energy equations, or mobile phone Merkle Tree verification) to provide a more helpful and complete response.
   - However, since the **Judge Evaluator** strictly penalizes any information not explicitly present in the retrieved context source blocks, these "overly helpful" answers were marked down for lack of strict RAG faithfulness.

2. **Recommendations for Perfecting Faithfulness**:
   - To force the LLM to strictly adhere to the retrieved text, we can refine the system prompt in [notes.py](file:///e:/LLM%20LEARNING/AI%20Learning System/backend/app/routes/notes.py) to add a rule: 
     > *"Do not use any outside knowledge or add any supplementary details that are not directly stated in the excerpts under any circumstances. If a detail is not in the text, treat it as non-existent."*
   - Adjusting temperature to `0.0` (it is currently defaulted to the provider's default) would also reduce creative drift and background-knowledge leakage.
