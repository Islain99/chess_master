import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/http/api_client.dart';
import '../../auth/providers/auth_provider.dart';

enum AnalysisStatus { idle, requesting, processing, done, error }

class AnalysisState {
  const AnalysisState({
    this.status      = AnalysisStatus.idle,
    this.progress    = 0,
    this.evaluations = const [],
    this.accuracyWhite,
    this.accuracyBlack,
    this.engineDepth,
    this.error,
  });
  final AnalysisStatus status;
  final int      progress;
  final List<Map<String, dynamic>> evaluations;
  final double?  accuracyWhite;
  final double?  accuracyBlack;
  final int?     engineDepth;
  final String?  error;
  bool get isDone       => status == AnalysisStatus.done;
  bool get isProcessing => status == AnalysisStatus.processing;

  AnalysisState copyWith({
    AnalysisStatus? status, int? progress,
    List<Map<String, dynamic>>? evaluations,
    double? accuracyWhite, double? accuracyBlack,
    int? engineDepth, String? error,
  }) => AnalysisState(
    status:        status        ?? this.status,
    progress:      progress      ?? this.progress,
    evaluations:   evaluations   ?? this.evaluations,
    accuracyWhite: accuracyWhite ?? this.accuracyWhite,
    accuracyBlack: accuracyBlack ?? this.accuracyBlack,
    engineDepth:   engineDepth   ?? this.engineDepth,
    error:         error         ?? this.error,
  );
}

final analysisProvider =
    StateNotifierProvider.family<AnalysisNotifier, AnalysisState, String>(
  (ref, gameId) => AnalysisNotifier(ref.read(apiClientProvider), gameId),
);

class AnalysisNotifier extends StateNotifier<AnalysisState> {
  AnalysisNotifier(this._api, this._gameId) : super(const AnalysisState()) {
    _loadExisting();
  }
  final ApiClient _api;
  final String    _gameId;
  Timer? _pollTimer;

  @override
  void dispose() { _pollTimer?.cancel(); super.dispose(); }

  Future<void> _loadExisting() async {
    try {
      final data = await _api.get('/games/$_gameId/analysis');
      _applyResponse(data);
    } catch (_) {}
  }

  Future<void> requestAnalysis() async {
    state = state.copyWith(status: AnalysisStatus.requesting);
    try {
      await _api.post('/games/$_gameId/analysis', {});
      state = state.copyWith(status: AnalysisStatus.processing, progress: 0);
      _startPolling();
    } catch (e) {
      state = state.copyWith(
        status: AnalysisStatus.error,
        error:  'Erreur : $e',
      );
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      try {
        final data = await _api.get('/games/$_gameId/analysis');
        _applyResponse(data);
        if (state.isDone) _pollTimer?.cancel();
      } catch (_) {}
    });
  }

  void _applyResponse(Map<String, dynamic> data) {
    switch (data['status'] as String? ?? '') {
      case 'done':
        state = state.copyWith(
          status:        AnalysisStatus.done,
          accuracyWhite: (data['accuracyWhite'] as num?)?.toDouble(),
          accuracyBlack: (data['accuracyBlack'] as num?)?.toDouble(),
          engineDepth:   data['engineDepth'] as int?,
          evaluations:   (data['evaluations'] as List? ?? [])
              .cast<Map<String, dynamic>>(),
        );
      case 'processing':
        state = state.copyWith(
          status:   AnalysisStatus.processing,
          progress: (data['progress'] as num?)?.toInt() ?? state.progress,
        );
        if (!(_pollTimer?.isActive ?? false)) _startPolling();
      default:
        state = state.copyWith(status: AnalysisStatus.idle);
    }
  }
}
