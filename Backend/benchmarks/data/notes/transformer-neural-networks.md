## 📘 Domain Architectural Overview

Transformer Neural Networks address the fundamental systemic problem of capturing long-range dependencies in sequential data while simultaneously enabling parallel computation, a significant limitation for predecessor architectures like Recurrent Neural Networks (RNNs) and Convolutional Neural Networks (CNNs). RNNs struggle with vanishing/exploding gradients over long sequences and are inherently sequential, preventing parallelization across time steps. CNNs, while parallelizable, have a fixed receptive field size, requiring stacked layers to capture global context, which can be inefficient for very long sequences.

Transformers achieve this by entirely eschewing recurrence and convolutions, relying solely on an **attention mechanism** to weigh the importance of different parts of the input sequence for each element. This allows for direct computation of relationships between any two positions in a sequence, regardless of their distance.

**Why it matters:** Transformers have revolutionized Natural Language Processing (NLP) and are increasingly adopted in Computer Vision (CV) and other domains. They enable state-of-the-art performance in tasks requiring sophisticated understanding of context and relationships within data, such as machine translation, text summarization, question answering, protein folding prediction (AlphaFold), and even image generation (Vision Transformers, DALL-E).

**Production Implementations:**
*   **Google Search:** Powering semantic search and understanding user queries.
*   **Machine Translation (Google Translate, DeepL):** Enabling highly accurate cross-lingual communication.
*   **Large Language Models (LLMs) (GPT-3/4, BERT, T5, LLaMA):** Core architecture for conversational AI, content generation, and code completion.
*   **Recommendation Systems:** Capturing complex user-item interaction sequences.
*   **Drug Discovery:** Predicting molecular properties and protein structures.

## 🔑 Core Mechanics — Detailed Breakdown

### **1. Input Embedding**
Defines the numerical representation of input tokens (words, subwords, pixels) into a continuous vector space. This includes both **token embeddings** and **positional embeddings**.
*   **Scope:** Convert discrete input elements into dense, fixed-size vectors suitable for neural network processing. Positional embeddings inject information about the sequence order, which attention mechanisms inherently lack.
*   **Code/Syntax Declaration:**
    ```python
    import torch
    import torch.nn as nn

    # Token Embedding
    vocab_size = 30000
    d_model = 512 # Dimensionality of the model
    token_embedding_layer = nn.Embedding(vocab_size, d_model)

    # Positional Embedding (Simplified Sinusoidal)
    # This is often handled by a separate module or function
    max_sequence_length = 512
    positional_encoding_layer = PositionalEncoding(d_model, max_sequence_length)
    ```
*   **Micro-use Case:** For the sentence "The quick brown fox", each word ("The", "quick", "brown", "fox") is mapped to a $d_{model}$-dimensional vector. Then, a positional encoding vector is added to each word's embedding, indicating its relative position (1st, 2nd, 3rd, 4th) in the sequence.

### **2. Multi-Head Attention**
The core mechanism that allows the model to jointly attend to information from different representation subspaces at different positions. It performs several attention calculations in parallel and concatenates their outputs.
*   **Scope:** Enables the model to learn weighted relationships between elements in a sequence. By using multiple "heads", it can capture diverse types of relationships (e.g., syntactic vs. semantic dependencies).
*   **Code/Syntax Declaration:**
    ```python
    class MultiHeadAttention(nn.Module):
        def __init__(self, d_model, num_heads):
            super().__init__()
            self.d_model = d_model
            self.num_heads = num_heads
            self.d_k = d_model // num_heads # Dimension of K, Q, V for each head
            assert d_model % num_heads == 0

            self.w_q = nn.Linear(d_model, d_model) # Weight matrix for Query
            self.w_k = nn.Linear(d_model, d_model) # Weight matrix for Key
            self.w_v = nn.Linear(d_model, d_model) # Weight matrix for Value
            self.w_o = nn.Linear(d_model, d_model) # Output linear layer

        def forward(self, q, k, v, mask=None):
            # ... detailed implementation involves splitting heads, scaled dot-product, concat ...
            pass
    ```
*   **Micro-use Case:** In a translation task, when translating "The animal didn't cross the street because it was too tired," the word "it" needs to attend strongly to "animal" to correctly resolve the anaphora. One attention head might capture this subject-verb agreement, while another might focus on "tired" to understand the reason.

### **3. Scaled Dot-Product Attention**
The fundamental building block of attention. It computes the attention scores by taking the dot product of the **Query** with all **Key** vectors, dividing by the square root of the key's dimension ($d_k$), and applying a softmax function to get weights. These weights are then applied to the **Value** vectors.
*   **Scope:** Computes the "similarity" between a query and keys, producing a set of weights that determine how much focus to place on each value.
*   **Code/Syntax Declaration:**
    ```python
    def scaled_dot_product_attention(q, k, v, mask=None):
        d_k = q.size(-1)
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(d_k)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9) # Mask out illegal connections
        attention_weights = F.softmax(scores, dim=-1)
        output = torch.matmul(attention_weights, v)
        return output, attention_weights
    ```
*   **Micro-use Case:** For a given query vector representing the word "bank" (e.g., financial institution), it computes dot products with all key vectors in the sentence. If another key vector represents "river bank", their dot product would be low, leading to a low attention weight. If a key vector represents "investment", their dot product would be high, leading to a high attention weight.

### **4. Position-wise Feed-Forward Networks (FFN)**
A simple, fully connected feed-forward network applied independently to each position in the sequence. It consists of two linear transformations with a ReLU activation in between.
*   **Scope:** Adds non-linearity and allows the model to process the attended information further. It's applied identically and independently to each position, making it "position-wise."
*   **Code/Syntax Declaration:**
    ```python
    class PositionwiseFeedForward(nn.Module):
        def __init__(self, d_model, d_ff, dropout=0.1):
            super().__init__()
            self.w_1 = nn.Linear(d_model, d_ff) # First linear layer
            self.w_2 = nn.Linear(d_ff, d_model) # Second linear layer
            self.dropout = nn.Dropout(dropout)

        def forward(self, x):
            return self.w_2(self.dropout(F.relu(self.w_1(x))))
    ```
*   **Micro-use Case:** After attention has identified important contextual information for a token like "apple," the FFN processes this refined representation. It might learn to transform the vector for "apple" into a representation that better distinguishes it as a fruit versus a company, based on preceding context.

### **5. Residual Connections & Layer Normalization**
*   **Residual Connections (Skip Connections):** Add the input of a sub-layer to its output. This helps alleviate the vanishing gradient problem and allows deeper networks to train effectively by providing direct paths for gradients.
    *   **Scope:** Improve training stability and accelerate convergence in deep networks.
    *   **Code/Syntax Declaration:**
        ```python
        # Conceptual: output = input + sublayer_output(input)
        # In a block: x = self.attention_block(x)
        #             x = x + self.feed_forward_block(x) # Simplified representation
        ```
    *   **Micro-use Case:** If a sub-layer (like Multi-Head Attention) initially struggles to learn a useful transformation, the residual connection ensures that the original information flows through, preventing information loss and allowing the network to refine the representation gradually.
*   **Layer Normalization:** Normalizes the inputs across the features for each sample independently. Unlike Batch Normalization, it is insensitive to batch size.
    *   **Scope:** Stabilize activations, improve gradient flow, and reduce internal covariate shift. Applied after the sum of the sub-layer output and its residual connection.
    *   **Code/Syntax Declaration:**
        ```python
        layer_norm_layer = nn.LayerNorm(d_model) # Applied over the last dimension (features)
        # Conceptual: output = layer_norm(input + sublayer_output(input))
        ```
    *   **Micro-use Case:** After a residual connection, if certain feature dimensions have very large values and others very small, Layer Normalization rescales them to have zero mean and unit variance. This ensures that the subsequent layers receive inputs within a consistent range, preventing gradient instabilities.

### **6. Encoder-Decoder Architecture (Standard Transformer)**
*   **Encoder:** A stack of identical layers, each containing a **Multi-Head Self-Attention** mechanism followed by a **Position-wise FFN**.
    *   **Scope:** Processes the input sequence (e.g., source language sentence) to generate a rich, contextualized representation. Each layer refines this representation by allowing each position to attend to all other positions in the input.
    *   **Micro-use Case:** Takes an English sentence like "Je suis étudiant" and encodes it into a sequence of $d_{model}$-dimensional vectors where each vector captures the meaning of its corresponding word in the context of the entire sentence.
*   **Decoder:** A stack of identical layers, each containing a **Masked Multi-Head Self-Attention** mechanism, a **Multi-Head Cross-Attention** mechanism, and a **Position-wise FFN**.
    *   **Scope:** Generates the output sequence (e.g., target language sentence) one token at a time. The masked self-attention ensures causality (cannot attend to future tokens), while cross-attention allows it to attend to the encoded source sequence to generate the next token.
    *   **Micro-use Case:** Given the encoded English sentence and previously generated French tokens ("I am a"), the decoder uses cross-attention to look at the English encoding and masked self-attention to look at "I am a" to predict the next word, "student."

## 💻 Practical Code Implementations

Below is a simplified, production-grade PyTorch implementation of a Transformer Encoder Layer, incorporating Multi-Head Attention, Position-wise Feed-Forward Networks, Residual Connections, and Layer Normalization.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class MultiHeadAttention(nn.Module):
    """
    Multi-Head Attention module for Transformer.
    Implements scaled dot-product attention across multiple heads in parallel.
    """
    def __init__(self, d_model: int, num_heads: int, dropout_rate: float = 0.1):
        super().__init__()
        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"

        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads # Dimension of K, Q, V for each head

        self.w_q = nn.Linear(d_model, d_model) # Query projection matrix
        self.w_k = nn.Linear(d_model, d_model) # Key projection matrix
        self.w_v = nn.Linear(d_model, d_model) # Value projection matrix
        self.w_o = nn.Linear(d_model, d_model) # Output projection matrix

        self.dropout = nn.Dropout(p=dropout_rate)

    def _split_heads(self, x: torch.Tensor, batch_size: int) -> torch.Tensor:
        """
        Reshapes tensor to (batch_size, num_heads, sequence_length, d_k)
        for parallel processing across attention heads.
        """
        return x.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)

    def _scaled_dot_product_attention(self, q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        Computes scaled dot-product attention.
        Args:
            q (torch.Tensor): Queries tensor (batch_size, num_heads, seq_len_q, d_k)
            k (torch.Tensor): Keys tensor (batch_size, num_heads, seq_len_k, d_k)
            v (torch.Tensor): Values tensor (batch_size, num_heads, seq_len_v, d_k)
            mask (torch.Tensor, optional): Attention mask (batch_size, 1, 1, seq_len_k).
                                           Defaults to None.
        Returns:
            torch.Tensor: Weighted sum of values (batch_size, num_heads, seq_len_q, d_k)
        """
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.d_k)

        if mask is not None:
            # Masking: set scores for masked positions to a very small number
            # to make softmax output close to zero.
            scores = scores.masked_fill(mask == 0, -1e9)

        attention_weights = F.softmax(scores, dim=-1)
        attention_weights = self.dropout(attention_weights) # Apply dropout to weights

        output = torch.matmul(attention_weights, v)
        return output

    def forward(self, query: torch.Tensor, key: torch.Tensor, value: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        Forward pass for Multi-Head Attention.
        Args:
            query, key, value (torch.Tensor): Input tensors (batch_size, seq_len, d_model)
            mask (torch.Tensor, optional): Attention mask. Defaults to None.
        Returns:
            torch.Tensor: Output tensor after attention (batch_size, seq_len, d_model)
        """
        batch_size = query.size(0)

        # 1. Project Q, K, V linearly
        # (batch_size, seq_len, d_model) -> (batch_size, seq_len, d_model)
        q = self.w_q(query)
        k = self.w_k(key)
        v = self.w_v(value)

        # 2. Split into multiple heads
        # (batch_size, seq_len, d_model) -> (batch_size, num_heads, seq_len, d_k)
        q = self._split_heads(q, batch_size)
        k = self._split_heads(k, batch_size)
        v = self._split_heads(v, batch_size)

        # 3. Apply scaled dot-product attention
        # (batch_size, num_heads, seq_len_q, d_k)
        attention_output = self._scaled_dot_product_attention(q, k, v, mask)

        # 4. Concatenate heads and apply final linear layer
        # (batch_size, num_heads, seq_len_q, d_k) -> (batch_size, seq_len_q, d_model)
        attention_output = attention_output.transpose(1, 2).contiguous().view(batch_size, -1, self.d_model)
        output = self.w_o(attention_output)

        return output

class PositionwiseFeedForward(nn.Module):
    """
    Position-wise Feed-Forward Network.
    Applies two linear transformations with ReLU activation in between.
    """
    def __init__(self, d_model: int, d_ff: int, dropout_rate: float = 0.1):
        super().__init__()
        self.w_1 = nn.Linear(d_model, d_ff)
        self.w_2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(p=dropout_rate)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for Position-wise Feed-Forward Network.
        Args:
            x (torch.Tensor): Input tensor (batch_size, seq_len, d_model)
        Returns:
            torch.Tensor: Output tensor (batch_size, seq_len, d_model)
        """
        return self.w_2(self.dropout(F.relu(self.w_1(x))))

class TransformerEncoderLayer(nn.Module):
    """
    A single layer of the Transformer Encoder.
    Consists of Multi-Head Self-Attention and a Position-wise Feed-Forward Network,
    each followed by Residual Connections and Layer Normalization.
    """
    def __init__(self, d_model: int, num_heads: int, d_ff: int, dropout_rate: float = 0.1):
        super().__init__()
        self.self_attention = MultiHeadAttention(d_model, num_heads, dropout_rate)
        self.feed_forward = PositionwiseFeedForward(d_model, d_ff, dropout_rate)

        self.norm1 = nn.LayerNorm(d_model) # Layer norm after attention
        self.norm2 = nn.LayerNorm(d_model) # Layer norm after FFN

        self.dropout1 = nn.Dropout(p=dropout_rate)
        self.dropout2 = nn.Dropout(p=dropout_rate)

    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        """
        Forward pass for Transformer Encoder Layer.
        Args:
            x (torch.Tensor): Input tensor (batch_size, seq_len, d_model)
            mask (torch.Tensor, optional): Self-attention mask. Defaults to None.
        Returns:
            torch.Tensor: Output tensor of the encoder layer (batch_size, seq_len, d_model)
        """
        # Multi-Head Self-Attention sub-layer
        # (x is used for Q, K, V for self-attention)
        attn_output = self.self_attention(x, x, x, mask)
        # Add & Norm
        x = self.norm1(x + self.dropout1(attn_output))

        # Position-wise Feed-Forward sub-layer
        ff_output = self.feed_forward(x)
        # Add & Norm
        x = self.norm2(x + self.dropout2(ff_output))

        return x

# Example Usage:
if __name__ == "__main__":
    d_model = 512       # Dimensionality of model embeddings
    num_heads = 8       # Number of attention heads
    d_ff = 2048         # Dimensionality of the inner FFN layer
    dropout_rate = 0.1
    batch_size = 2
    sequence_length = 10
    
    # Simulate input embeddings (batch_size, sequence_length, d_model)
    dummy_input = torch.randn(batch_size, sequence_length, d_model)

    # Create a mask (e.g., for padding, if sequence_length varies)
    # A simple example: let's say the 2nd sample has padding at pos 8,9
    # mask (batch_size, 1, 1, sequence_length) -> expands for heads and query dim
    mask = torch.ones(batch_size, 1, 1, sequence_length, dtype=torch.bool)
    mask[1, :, :, 8:] = False # Mask out positions 8, 9 for the second sample

    encoder_layer = TransformerEncoderLayer(d_model, num_heads, d_ff, dropout_rate)
    
    print(f"Input shape: {dummy_input.shape}")
    output = encoder_layer(dummy_input, mask)
    print(f"Output shape: {output.shape}")

    # Verify a decoder layer's cross-attention (conceptual, not implemented above)
    # class TransformerDecoderLayer(nn.Module):
    #     def __init__(self, d_model, num_heads, d_ff, dropout_rate):
    #         super().__init__()
    #         self.masked_self_attention = MultiHeadAttention(d_model, num_heads, dropout_rate)
    #         self.cross_attention = MultiHeadAttention(d_model, num_heads, dropout_rate) # Cross-attention
    #         self.feed_forward = PositionwiseFeedForward(d_model, d_ff, dropout_rate)
    #         self.norm1 = nn.LayerNorm(d_model)
    #         self.norm2 = nn.LayerNorm(d_model)
    #         self.norm3 = nn.LayerNorm(d_model)
    #         self.dropout1 = nn.Dropout(dropout_rate)
    #         self.dropout2 = nn.Dropout(dropout_rate)
    #         self.dropout3 = nn.Dropout(dropout_rate)
            
    #     def forward(self, tgt: torch.Tensor, memory: torch.Tensor, tgt_mask: torch.Tensor, memory_mask: torch.Tensor) -> torch.Tensor:
    #         # Masked Self-Attention
    #         tgt_attn_output = self.masked_self_attention(tgt, tgt, tgt, tgt_mask)
    #         tgt = self.norm1(tgt + self.dropout1(tgt_attn_output))

    #         # Cross-Attention (Query from target, Key/Value from encoder output 'memory')
    #         cross_attn_output = self.cross_attention(tgt, memory, memory, memory_mask)
    #         tgt = self.norm2(tgt + self.dropout2(cross_attn_output))

    #         # Feed-Forward
    #         ff_output = self.feed_forward(tgt)
    #         tgt = self.norm3(tgt + self.dropout3(ff_output))
    #         return tgt
    
    # # Example for Decoder Layer
    # dummy_encoder_output = torch.randn(batch_size, sequence_length, d_model) # 'memory'
    # dummy_decoder_input = torch.randn(batch_size, sequence_length, d_model) # 'tgt'
    # decoder_layer = TransformerDecoderLayer(d_model, num_heads, d_ff, dropout_rate)
    
    # # Decoder self-attention mask (for causal masking, e.g., upper triangle)
    # # torch.triu(torch.ones(seq_len, seq_len) == 0) for upper triangle mask
    # tgt_mask = torch.triu(torch.ones(sequence_length, sequence_length), diagonal=1).bool()
    # tgt_mask = tgt_mask.unsqueeze(0).unsqueeze(0).repeat(batch_size, 1, 1, 1) # (B, 1, S, S)
    
    # # Cross-attention mask (same as encoder mask in this example)
    # memory_mask = mask # Re-using encoder mask
    
    # print(f"\nDecoder Input shape: {dummy_decoder_input.shape}")
    # decoder_output = decoder_layer(dummy_decoder_input, dummy_encoder_output, tgt_mask, memory_mask)
    # print(f"Decoder Output shape: {decoder_output.shape}")
```
[cite: 1] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., ... & Polosukhin, I. (2017). Attention is all you need. *Advances in neural information processing systems*, *30*.
[cite: 2] Paszke, A., Gross, S., Massa, F., Lerer, A., Bradbury, J., Chanan, G., ... & Chintala, S. (2019). PyTorch: An imperative style, high-performance deep learning library. *Advances in Neural Information Processing Systems*, *32*.

## 📊 Comparative Analysis & Trade-offs

| Feature / Architecture | Transformer | Recurrent Neural Network (RNN) | Convolutional Neural Network (CNN) |
| :--------------------- | :---------- | :----------------------------- | :--------------------------------- |
| **Parallelization**      | High (across sequence positions) | Low (inherently sequential)        | High (across spatial dimensions)   |
| **Long-range Dependencies** | Excellent (direct attention path) | Poor (vanishing/exploding gradients) | Good (with deep stacks/large kernels) |
| **Computational Complexity (per layer, per example)** | $O(L^2 \cdot d_{model})$ for self-attention, $O(L \cdot d_{model}^2)$ for FFN. Total: $O(L^2 \cdot d_{model})$ | $O(L \cdot d_{model}^2)$           | $O(L \cdot k \cdot d_{model})$ where $k$ is kernel size |
| **Memory Complexity**    | $O(L^2)$ for attention weights, $O(L \cdot d_{model})$ for hidden states. Total: $O(L^2)$ | $O(L \cdot d_{model})$             | $O(L \cdot d_{model})$             |
| **Inductive Bias**       | None for local relations (learned via attention patterns). Relies on positional embeddings for order. | Sequence order, local context      | Local connectivity, translation invariance |
| **Interpretability**     | Attention weights offer some insight into dependencies. | Hard to interpret internal states. | Filter visualizations can be insightful. |
| **Training Speed**       | Faster due to parallelization (on modern hardware like GPUs/TPUs). | Slower due to sequential nature.   | Fast for local features, but depth for global context can slow. |
| **Typical Use Cases**    | NLP (NMT, LLMs), CV (ViT), ASR, GNNs | Simple sequence tasks, time series | Image recognition, speech, text classification |
| **Key Limitation**       | $O(L^2)$ complexity is prohibitive for very long sequences. Requires large datasets. | Vanishing/exploding gradients, slow. | Fixed receptive field, less flexible for global context. |

## ⚡ Performance Cheatsheet

*   **Self-Attention Computational Complexity:**
    *   For sequence length $L$ and model dimension $d_{model}$:
    *   Computing Q, K, V projections: $3 \times O(L \cdot d_{model}^2)$
    *   Calculating attention scores (Q * K^T): $O(L^2 \cdot d_{model})$
    *   Multiplying by V: $O(L^2 \cdot d_{model})$
    *   Total per head: $O(L^2 \cdot d_{model})$
    *   Total for Multi-Head Attention: $O(L^2 \cdot d_{model})$ (since parallel heads are effectively constant factor $h$)
*   **Position-wise Feed-Forward Network Complexity:**
    *   $O(L \cdot d_{model} \cdot d_{ff})$ where $d_{ff}$ is the hidden dimension of the FFN (typically $4 \cdot d_{model}$).
    *   Total: $O(L \cdot d_{model}^2)$
*   **Overall Transformer Layer Complexity:**
    *   Dominated by self-attention: $O(L^2 \cdot d_{model})$
*   **Memory Complexity:**
    *   Attention weights matrix: $O(L^2)$ (for $L \times L$ matrix per head per batch element)
    *   Activations (Q, K, V, output): $O(L \cdot d_{model})$
    *   Total: $O(L^2)$
*   **Maximum Sequence Length Constraint:**
    *   The $O(L^2)$ complexity for computation and memory fundamentally limits the maximum sequence length $L$ that can be practically handled on available hardware. Techniques like sparse attention, linearized attention, or recurrence over attention (e.g., Reformer, Longformer, Performer) aim to mitigate this.
*   **Positional Encoding Properties:**
    *   Sinusoidal positional encodings:
        $$
        PE_{(pos, 2i)} = \sin(pos / 10000^{2i/d_{model}})
        $$
        $$
        PE_{(pos, 2i+1)} = \cos(pos / 10000^{2i/d_{model}})
        $$
        where $pos$ is the position and $i$ is the dimension index. These allow the model to infer relative positions and can extrapolate to longer sequences.
*   **Layer Normalization:**
    *   Normalizes across the features ($d_{model}$ dimension) for each sample independently.
    *   Output: mean 0, variance 1.
    *   Formula (simplified for a single feature vector $x$):
        $$
        y = \frac{x - E[x]}{\sqrt{Var[x] + \epsilon}} \cdot \gamma + \beta
        $$
        where $E[x]$ is the mean of $x$, $Var[x]$ is the variance of $x$, $\epsilon$ is a small constant for numerical stability, and $\gamma$, $\beta$ are learnable scaling and shifting parameters.

## 🎯 Must-Know Summary

*   Transformers achieve state-of-the-art performance by entirely replacing recurrence and convolutions with **Multi-Head Self-Attention**.
*   **Self-Attention** allows each token to weigh the importance of every other token in the sequence, enabling direct capture of long-range dependencies.
*   **Positional Encodings** are crucial for injecting sequence order information, which attention mechanisms inherently lack.
*   The architecture heavily relies on **Residual Connections** and **Layer Normalization** to facilitate stable training of deep networks.
*   **Encoder-Decoder** structure handles sequence-to-sequence tasks, with the encoder processing input and the decoder generating output using **masked self-attention** and **cross-attention**.
*   The primary bottleneck is the **$O(L^2)$ computational and memory complexity** with respect to sequence length ($L$), limiting its application to very long sequences.
*   **Multi-head attention** allows the model to attend to different aspects of the input simultaneously, enriching its representational capacity.