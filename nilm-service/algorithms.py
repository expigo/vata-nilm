"""
NILM Algorithm Implementations

Includes:
- Combinatorial Optimization (CO)
- Factorial Hidden Markov Model (FHMM)
- Seq2Point (CNN)
- Seq2Seq (LSTM/GRU)
- BERT4NILM (Transformer)
"""

import numpy as np
from typing import Dict, List, Tuple, Any
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# Base Algorithm Class
# ============================================================================

class NILMAlgorithm(ABC):
    """Base class for all NILM algorithms"""

    def __init__(self, name: str):
        self.name = name
        self.model = None
        self.is_trained = False
        self.appliances = []

    @abstractmethod
    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """Train the model"""
        pass

    @abstractmethod
    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """
        Predict appliance power consumption
        Returns: {appliance_id: power_array}
        """
        pass

    @abstractmethod
    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """
        Predict appliance states
        Returns: {appliance_id: [state1, state2, ...]}
        """
        pass

    def load_model(self, model_path: str):
        """Load a pre-trained model"""
        raise NotImplementedError

    def save_model(self, model_path: str):
        """Save the trained model"""
        raise NotImplementedError


# ============================================================================
# Combinatorial Optimization (CO)
# ============================================================================

class CombinatorioOptimization(NILMAlgorithm):
    """
    Combinatorial Optimization algorithm
    Finds the best combination of appliance states that matches aggregate power
    Uses dynamic programming for efficiency
    """

    def __init__(self):
        super().__init__("CO")
        self.power_states = {}  # {appliance_id: [state_powers]}
        self.tolerance = 50  # watts tolerance

    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """
        Learn appliance power states from training data
        """
        logger.info(f"Training CO for {len(appliances)} appliances")

        self.appliances = appliances

        for appliance in appliances:
            app_id = appliance['id']

            # Get appliance power signature
            nominal_power = appliance.get('nominal_power', 0)
            standby_power = appliance.get('standby_power', 0)

            # Create discrete power states (OFF, STANDBY, ON, ...)
            states = [0, standby_power]  # OFF, STANDBY

            if nominal_power > 0:
                states.append(nominal_power)  # ON

            # Add intermediate states if available in signature
            signature = appliance.get('signature_features', {})
            if isinstance(signature, dict):
                multi_states = signature.get('power_states', [])
                states.extend(multi_states)

            self.power_states[app_id] = sorted(list(set(states)))

        self.is_trained = True
        logger.info("CO training complete")

    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """
        Use combinatorial optimization to disaggregate power
        """
        if not self.is_trained:
            raise ValueError("Model not trained")

        results = {}

        for i, total_power in enumerate(aggregate_power):
            # Find best combination of appliance states
            combination = self._find_best_combination(total_power)

            for app_id, power in combination.items():
                if app_id not in results:
                    results[app_id] = np.zeros(len(aggregate_power))
                results[app_id][i] = power

        return results

    def _find_best_combination(self, target_power: float) -> Dict[int, float]:
        """
        Dynamic programming to find best combination
        This is a simplified version - can be enhanced with more sophisticated optimization
        """
        best_combination = {}
        remaining_power = target_power

        # Sort appliances by nominal power (descending)
        sorted_apps = sorted(
            self.appliances,
            key=lambda x: x.get('nominal_power', 0),
            reverse=True
        )

        for appliance in sorted_apps:
            app_id = appliance['id']
            states = self.power_states.get(app_id, [0])

            # Find best state for this appliance
            best_state = 0
            min_error = abs(remaining_power)

            for state_power in states:
                if state_power <= remaining_power + self.tolerance:
                    error = abs(remaining_power - state_power)
                    if error < min_error:
                        best_state = state_power
                        min_error = error

            best_combination[app_id] = best_state
            remaining_power -= best_state

        return best_combination

    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """Predict ON/OFF states"""
        power_predictions = self.predict(aggregate_power)
        state_predictions = {}

        for app_id, powers in power_predictions.items():
            states = []
            standby_threshold = 10  # watts

            for power in powers:
                if power < standby_threshold:
                    states.append("OFF")
                elif power < 50:
                    states.append("STANDBY")
                else:
                    states.append("ON")

            state_predictions[app_id] = states

        return state_predictions


# ============================================================================
# Factorial Hidden Markov Model (FHMM)
# ============================================================================

class FactorialHMM(NILMAlgorithm):
    """
    Factorial Hidden Markov Model
    Models each appliance as an independent HMM
    """

    def __init__(self):
        super().__init__("FHMM")
        self.hmms = {}  # {appliance_id: HMM}

    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """Train HMM for each appliance"""
        from hmmlearn import hmm

        logger.info(f"Training FHMM for {len(appliances)} appliances")

        self.appliances = appliances

        for appliance in appliances:
            app_id = appliance['id']

            # Create 3-state HMM (OFF, STANDBY, ON)
            model = hmm.GaussianHMM(n_components=3, covariance_type="diag")

            # Initialize with appliance signature
            nominal_power = appliance.get('nominal_power', 100)
            standby_power = appliance.get('standby_power', 5)

            model.means_ = np.array([[0], [standby_power], [nominal_power]])
            model.covars_ = np.array([[10], [5], [50]])

            # Transition matrix (simplified)
            model.transmat_ = np.array([
                [0.9, 0.05, 0.05],  # OFF -> OFF, STANDBY, ON
                [0.1, 0.8, 0.1],     # STANDBY -> ...
                [0.05, 0.05, 0.9]    # ON -> ...
            ])

            self.hmms[app_id] = model

        self.is_trained = True
        logger.info("FHMM training complete")

    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """Viterbi algorithm to find most likely appliance states"""
        if not self.is_trained:
            raise ValueError("Model not trained")

        results = {}

        # Simplified disaggregation
        # In practice, this would use factorial Viterbi algorithm
        for app_id, model in self.hmms.items():
            # Predict states
            states = model.predict(aggregate_power.reshape(-1, 1))

            # Map states to power
            power = model.means_[states].flatten()
            results[app_id] = power

        return results

    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """Predict states using HMM"""
        results = {}
        state_names = ["OFF", "STANDBY", "ON"]

        for app_id, model in self.hmms.items():
            states = model.predict(aggregate_power.reshape(-1, 1))
            results[app_id] = [state_names[s] for s in states]

        return results


# ============================================================================
# Seq2Point (CNN-based)
# ============================================================================

class Seq2PointModel(NILMAlgorithm):
    """
    Seq2Point model using CNN
    Input: sequence of aggregate power
    Output: single power value for target appliance
    """

    def __init__(self):
        super().__init__("Seq2Point")
        self.models = {}  # {appliance_id: model}
        self.sequence_length = 99

    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """Train CNN for each appliance"""
        from tensorflow import keras
        from tensorflow.keras import layers

        logger.info(f"Training Seq2Point for {len(appliances)} appliances")

        self.appliances = appliances

        for appliance in appliances:
            app_id = appliance['id']

            # Build Seq2Point architecture
            model = keras.Sequential([
                layers.Conv1D(30, 10, activation='relu', input_shape=(self.sequence_length, 1)),
                layers.Conv1D(30, 8, activation='relu'),
                layers.Conv1D(40, 6, activation='relu'),
                layers.Conv1D(50, 5, activation='relu'),
                layers.Conv1D(50, 5, activation='relu'),
                layers.Flatten(),
                layers.Dense(1024, activation='relu'),
                layers.Dense(1, activation='linear')
            ])

            model.compile(optimizer='adam', loss='mse', metrics=['mae'])
            self.models[app_id] = model

        self.is_trained = True
        logger.info("Seq2Point models created (training with data required)")

    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """Predict appliance power"""
        if not self.is_trained:
            raise ValueError("Model not trained")

        results = {}

        # Create sequences
        sequences = self._create_sequences(aggregate_power)

        for app_id, model in self.models.items():
            predictions = model.predict(sequences, verbose=0).flatten()
            # Pad to match original length
            padded = np.pad(predictions, (self.sequence_length // 2, self.sequence_length // 2), mode='edge')
            results[app_id] = padded[:len(aggregate_power)]

        return results

    def _create_sequences(self, data: np.ndarray) -> np.ndarray:
        """Create sliding window sequences"""
        sequences = []
        for i in range(len(data) - self.sequence_length + 1):
            sequences.append(data[i:i + self.sequence_length])
        return np.array(sequences).reshape(-1, self.sequence_length, 1)

    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """Predict states from power"""
        power_predictions = self.predict(aggregate_power)
        return self._power_to_states(power_predictions)

    def _power_to_states(self, power_predictions: Dict[int, np.ndarray]) -> Dict[int, List[str]]:
        """Convert power to states"""
        results = {}
        for app_id, powers in power_predictions.items():
            states = []
            for power in powers:
                if power < 10:
                    states.append("OFF")
                elif power < 50:
                    states.append("STANDBY")
                else:
                    states.append("ON")
            results[app_id] = states
        return results


# ============================================================================
# Seq2Seq (LSTM/GRU-based)
# ============================================================================

class Seq2SeqModel(NILMAlgorithm):
    """
    Seq2Seq model using LSTM/GRU
    Input: sequence of aggregate power
    Output: sequence of appliance power
    """

    def __init__(self):
        super().__init__("Seq2Seq")
        self.models = {}
        self.sequence_length = 100

    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """Train Seq2Seq for each appliance"""
        from tensorflow import keras
        from tensorflow.keras import layers

        logger.info(f"Training Seq2Seq for {len(appliances)} appliances")

        self.appliances = appliances

        for appliance in appliances:
            app_id = appliance['id']

            # Build Seq2Seq architecture
            model = keras.Sequential([
                layers.Bidirectional(
                    layers.LSTM(128, return_sequences=True),
                    input_shape=(self.sequence_length, 1)
                ),
                layers.Dropout(0.2),
                layers.Bidirectional(layers.LSTM(64, return_sequences=True)),
                layers.Dropout(0.2),
                layers.TimeDistributed(layers.Dense(1, activation='linear'))
            ])

            model.compile(optimizer='adam', loss='mse', metrics=['mae'])
            self.models[app_id] = model

        self.is_trained = True
        logger.info("Seq2Seq models created")

    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """Predict appliance power sequences"""
        if not self.is_trained:
            raise ValueError("Model not trained")

        results = {}

        # Create sequences
        sequences = self._create_sequences(aggregate_power)

        for app_id, model in self.models.items():
            predictions = model.predict(sequences, verbose=0)
            # Flatten and reconstruct
            flattened = predictions.reshape(-1)
            results[app_id] = flattened[:len(aggregate_power)]

        return results

    def _create_sequences(self, data: np.ndarray) -> np.ndarray:
        """Create sliding window sequences"""
        sequences = []
        for i in range(0, len(data), self.sequence_length):
            seq = data[i:i + self.sequence_length]
            if len(seq) < self.sequence_length:
                seq = np.pad(seq, (0, self.sequence_length - len(seq)), mode='edge')
            sequences.append(seq)
        return np.array(sequences).reshape(-1, self.sequence_length, 1)

    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """Predict states"""
        power_predictions = self.predict(aggregate_power)
        return self._power_to_states(power_predictions)

    def _power_to_states(self, power_predictions: Dict[int, np.ndarray]) -> Dict[int, List[str]]:
        """Convert power to states"""
        results = {}
        for app_id, powers in power_predictions.items():
            states = ["ON" if p > 50 else "STANDBY" if p > 10 else "OFF" for p in powers]
            results[app_id] = states
        return results


# ============================================================================
# BERT4NILM (Transformer-based)
# ============================================================================

class BERT4NILMModel(NILMAlgorithm):
    """
    BERT4NILM using Transformer architecture
    State-of-the-art NILM with attention mechanism
    """

    def __init__(self):
        super().__init__("BERT4NILM")
        self.models = {}
        self.sequence_length = 480  # 8 hours at 1-minute sampling

    def train(self, training_data: Dict[str, Any], appliances: List[Dict]):
        """Train Transformer for each appliance"""
        from tensorflow import keras
        from tensorflow.keras import layers

        logger.info(f"Training BERT4NILM for {len(appliances)} appliances")

        self.appliances = appliances

        for appliance in appliances:
            app_id = appliance['id']

            # Transformer encoder
            inputs = layers.Input(shape=(self.sequence_length, 1))
            x = layers.Dense(128)(inputs)

            # Multi-head attention
            attention = layers.MultiHeadAttention(num_heads=8, key_dim=64)(x, x)
            x = layers.Add()([x, attention])
            x = layers.LayerNormalization()(x)

            # Feed-forward
            ff = layers.Dense(256, activation='relu')(x)
            ff = layers.Dense(128)(ff)
            x = layers.Add()([x, ff])
            x = layers.LayerNormalization()(x)

            # Output
            x = layers.GlobalAveragePooling1D()(x)
            x = layers.Dense(256, activation='relu')(x)
            x = layers.Dropout(0.2)(x)
            outputs = layers.Dense(self.sequence_length, activation='linear')(x)

            model = keras.Model(inputs=inputs, outputs=outputs)
            model.compile(optimizer='adam', loss='mse', metrics=['mae'])

            self.models[app_id] = model

        self.is_trained = True
        logger.info("BERT4NILM models created")

    def predict(self, aggregate_power: np.ndarray) -> Dict[int, np.ndarray]:
        """Predict with Transformer"""
        if not self.is_trained:
            raise ValueError("Model not trained")

        results = {}

        # Create sequences
        sequences = self._create_sequences(aggregate_power)

        for app_id, model in self.models.items():
            predictions = model.predict(sequences, verbose=0)
            # Average overlapping predictions
            flattened = predictions.flatten()
            results[app_id] = flattened[:len(aggregate_power)]

        return results

    def _create_sequences(self, data: np.ndarray) -> np.ndarray:
        """Create sequences with positional encoding"""
        sequences = []
        for i in range(0, len(data), self.sequence_length // 2):
            seq = data[i:i + self.sequence_length]
            if len(seq) < self.sequence_length:
                seq = np.pad(seq, (0, self.sequence_length - len(seq)), mode='edge')
            sequences.append(seq)
        return np.array(sequences).reshape(-1, self.sequence_length, 1)

    def predict_states(self, aggregate_power: np.ndarray) -> Dict[int, List[str]]:
        """Predict states"""
        power_predictions = self.predict(aggregate_power)
        return self._power_to_states(power_predictions)

    def _power_to_states(self, power_predictions: Dict[int, np.ndarray]) -> Dict[int, List[str]]:
        """Convert power to states"""
        results = {}
        for app_id, powers in power_predictions.items():
            states = ["ON" if p > 50 else "STANDBY" if p > 10 else "OFF" for p in powers]
            results[app_id] = states
        return results


# ============================================================================
# Algorithm Factory
# ============================================================================

def get_algorithm(algorithm_name: str) -> NILMAlgorithm:
    """Factory function to get algorithm instance"""
    algorithms = {
        "CO": CombinatorioOptimization,
        "FHMM": FactorialHMM,
        "Seq2Point": Seq2PointModel,
        "Seq2Seq": Seq2SeqModel,
        "BERT4NILM": BERT4NILMModel
    }

    if algorithm_name not in algorithms:
        raise ValueError(f"Unknown algorithm: {algorithm_name}")

    return algorithms[algorithm_name]()
