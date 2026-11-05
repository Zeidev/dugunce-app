package com.lumibyte.dugunce.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * API hata gövdesi — backend'in standart formatı.
 *
 * `{"error": {"code": "...", "message": "...", "details": {...}}}`
 */
@Serializable
data class ApiErrorBody(
    val error: ApiErrorDetail,
)

@Serializable
data class ApiErrorDetail(
    val code: String,
    val message: String,
    val details: ErrorDetails? = null,
)

@Serializable
data class ErrorDetails(
    val limit: Int? = null,
    val current: Int? = null,
    val requested: Int? = null,
)

/**
 * Uygulama genelinde kullanılan hata tipi.
 *
 * `code` backend'in makine-okunur kodu (ör. `LIMIT_REACHED`), `message`
 * kullanıcıya gösterilebilir Türkçe metin.
 */
class ApiException(
    val statusCode: Int,
    val code: String,
    override val message: String,
    val details: ErrorDetails? = null,
) : Exception(message) {

    val isLimitReached: Boolean get() = code == "LIMIT_REACHED"
    val isUnauthorized: Boolean get() = statusCode == 401
    val isNotFound: Boolean get() = statusCode == 404
    val isValidation: Boolean get() = statusCode == 400 || statusCode == 422
}

/** Ağ hatası — sunucuya ulaşılamadı. */
class NetworkException(override val message: String) : Exception(message)
